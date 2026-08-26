from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend
from django.db.models import Q

User = get_user_model()


class EmailOrUsernameModelBackend(ModelBackend):
    """Authenticates against either the username or the email address.

    SimpleJWT's TokenObtainPairView still posts the field as `username`
    (that's just the request key name) — this backend simply checks that
    value against both columns instead of only `username`, so someone who
    forgot which one they registered with isn't locked out.
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        identifier = username or kwargs.get(User.USERNAME_FIELD)
        if identifier is None or password is None:
            return None

        try:
            user = User.objects.get(Q(username__iexact=identifier) | Q(email__iexact=identifier))
        except User.DoesNotExist:
            return None
        except User.MultipleObjectsReturned:
            # Only possible if two accounts somehow share an email — fall
            # back to an exact username match rather than guessing.
            user = User.objects.filter(username__iexact=identifier).first()
            if user is None:
                return None

        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None