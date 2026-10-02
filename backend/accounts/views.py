from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .serializers import RegisterSerializer, UserSerializer


class ThrottledLoginView(TokenObtainPairView):
    """Login, limited to a few attempts per minute to stop password guessing."""
    throttle_scope = 'auth'


class RegisterView(generics.CreateAPIView):
    """Public sign-up endpoint. Immediately issues JWT tokens on success so
    the person lands signed in, no separate login step required."""
    permission_classes = [permissions.AllowAny]
    serializer_class = RegisterSerializer
    throttle_scope = 'auth'

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        return Response({
            'user': UserSerializer(user).data,
            'access': str(refresh.access_token),
            'refresh': str(refresh),
        }, status=201)


class MeView(APIView):
    """Returns the signed-in user's profile — used by the frontend to
    confirm a stored token is still valid on app load."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)
