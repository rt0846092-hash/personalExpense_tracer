import re

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from rest_framework import permissions, status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from . import codes
from .models import EmailCode
from .serializers import RegisterSerializer, UserSerializer

User = get_user_model()


def signed_in(user, status_code=200):
    refresh = RefreshToken.for_user(user)
    return Response({'user': UserSerializer(user).data, 'access': str(refresh.access_token),
                     'refresh': str(refresh)}, status=status_code)


def find_by_email(email):
    email = (email or '').strip()
    if not email:
        return None
    return User.objects.filter(email__iexact=email).order_by('-is_active', 'pk').first()


class PublicView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_scope = 'auth'


class AuthOptionsView(APIView):
    """Which sign-in features are switched on, so the website only shows what works."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response({'email_codes': codes.email_configured()})


class ThrottledLoginView(TokenObtainPairView):
    """Login with username or email, limited to stop password guessing.

    Someone who signed up but never entered their email code gets told so
    (only after giving the right password), instead of "wrong password".
    """
    throttle_scope = 'auth'

    def post(self, request, *args, **kwargs):
        try:
            return super().post(request, *args, **kwargs)
        except AuthenticationFailed:
            ident = str(request.data.get('username', '')).strip()
            user = User.objects.filter(Q(username__iexact=ident) | Q(email__iexact=ident)).first() if ident else None
            if user and codes.is_pending_signup(user) and user.check_password(str(request.data.get('password', ''))):
                return Response({'code': 'email_not_verified', 'email': user.email,
                                 'detail': 'Please confirm your email first. Enter the code we sent you, or ask for a new one.'},
                                status=status.HTTP_403_FORBIDDEN)
            raise


class RegisterView(PublicView):
    """Sign up. The account stays locked until the emailed code is entered."""

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Without an email service there's no way to deliver a code, so the account is ready at once
        if not codes.email_configured():
            return signed_in(serializer.save(), status.HTTP_201_CREATED)

        with transaction.atomic():
            user = serializer.save(is_active=False)
            sent = codes.send_code(user, EmailCode.Purpose.VERIFY)
        return Response({
            'verification_required': True, 'email': user.email, 'email_sent': sent,
            'detail': f'We sent a 6-digit code to {user.email}.' if sent
                      else "We couldn't send the code right now. Tap “Send a new code” to try again.",
        }, status=status.HTTP_201_CREATED)


class VerifyEmailView(PublicView):
    def post(self, request):
        user = find_by_email(request.data.get('email'))
        if user is None or not codes.is_pending_signup(user):
            return Response({'detail': 'This code has expired. Ask for a new one.'}, status=400)
        try:
            codes.check_code(user, EmailCode.Purpose.VERIFY, str(request.data.get('code', '')))
        except codes.CodeError as e:
            return Response({'detail': str(e)}, status=400)
        user.is_active = True
        user.save(update_fields=['is_active'])
        return signed_in(user)


class ResendCodeView(PublicView):
    """Send a new code for signing up or resetting a password."""

    def post(self, request):
        purpose = request.data.get('purpose', EmailCode.Purpose.VERIFY)
        if purpose not in EmailCode.Purpose.values:
            return Response({'detail': 'Unknown code type.'}, status=400)
        user = find_by_email(request.data.get('email'))
        eligible = user is not None and (
            codes.is_pending_signup(user) if purpose == EmailCode.Purpose.VERIFY else user.is_active)
        if eligible:
            wait = codes.seconds_until_resend(user, purpose)
            if wait:
                return Response({'detail': f'Please wait {wait} seconds before asking for another code.', 'wait': wait}, status=429)
            if not codes.send_code(user, purpose):
                return Response({'detail': "We couldn't send the email right now. Please try again in a minute."}, status=503)
        # Same answer either way, so this can't be used to find out who has an account
        return Response({'detail': 'If that email has an account, a new code is on its way.'})


class PasswordResetRequestView(PublicView):
    def post(self, request):
        user = find_by_email(request.data.get('email'))
        if user is not None and user.is_active and not codes.seconds_until_resend(user, EmailCode.Purpose.RESET):
            if not codes.send_code(user, EmailCode.Purpose.RESET):
                return Response({'detail': "We couldn't send the email right now. Please try again in a minute."}, status=503)
        return Response({'detail': 'If that email has an account, we sent it a 6-digit code.'})


class PasswordResetConfirmView(PublicView):
    def post(self, request):
        user = find_by_email(request.data.get('email'))
        if user is None or not user.is_active:
            return Response({'detail': 'This code has expired. Ask for a new one.'}, status=400)
        new_password = str(request.data.get('new_password', ''))
        try:
            validate_password(new_password, user)
        except DjangoValidationError as e:
            return Response({'new_password': list(e.messages)}, status=400)
        try:
            codes.check_code(user, EmailCode.Purpose.RESET, str(request.data.get('code', '')))
        except codes.CodeError as e:
            return Response({'detail': str(e)}, status=400)
        user.set_password(new_password)
        user.save(update_fields=['password'])
        # Sign out every other device
        for token in OutstandingToken.objects.filter(user=user):
            BlacklistedToken.objects.get_or_create(token=token)
        return signed_in(user)


def username_from_email(email):
    base = re.sub(r'[^a-z0-9._]', '', email.split('@')[0].lower())[:20] or 'user'
    name, n = base, 2
    while User.objects.filter(username__iexact=name).exists():
        name, n = f'{base}{n}', n + 1
    return name


class GoogleLoginView(PublicView):
    """'Continue with Google'. Google signs a token proving who the person is;
    we check that signature, then sign them in (making an account if needed)."""

    def post(self, request):
        from google.auth.transport import requests as google_requests
        from google.oauth2 import id_token

        credential = request.data.get('credential')
        if not credential:
            return Response({'detail': 'Missing Google sign-in data.'}, status=400)
        try:
            info = id_token.verify_oauth2_token(credential, google_requests.Request(), settings.GOOGLE_CLIENT_ID)
        except ValueError:
            return Response({'detail': 'Google sign-in failed. Please try again.'}, status=400)
        if not info.get('email') or not info.get('email_verified'):
            return Response({'detail': 'Your Google account email is not verified.'}, status=400)

        user = find_by_email(info['email'])
        if user is None:
            user = User.objects.create_user(username=username_from_email(info['email']), email=info['email'])
            user.set_unusable_password()  # they can add one later with "Forgot password"
            user.save()
            return signed_in(user, status.HTTP_201_CREATED)
        if not user.is_active:
            if not codes.is_pending_signup(user):
                return Response({'detail': 'This account has been turned off.'}, status=403)
            user.is_active = True  # Google has proven they own the email
            user.save(update_fields=['is_active'])
        return signed_in(user)


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)
