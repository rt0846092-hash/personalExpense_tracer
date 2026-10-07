from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'password']

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError('That username is already taken.')
        return value

    email = serializers.EmailField()  # required: codes and password resets are sent here

    def _clear_abandoned_signup(self, **lookup):
        # Someone started signing up with this name/email but never entered the code.
        # Don't let that block a real sign-up forever.
        from django.utils import timezone
        from . import codes
        for user in User.objects.filter(is_active=False, **lookup):
            still_waiting = user.email_codes.filter(used_at__isnull=True, expires_at__gt=timezone.now()).exists()
            if codes.is_pending_signup(user) and not still_waiting:
                user.delete()

    def validate_username(self, value):
        value = value.strip()
        self._clear_abandoned_signup(username__iexact=value)
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError('That username is already taken.')
        return value

    def validate_email(self, value):
        value = value.strip()
        self._clear_abandoned_signup(email__iexact=value)
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('An account with this email already exists. Try signing in, or use "Forgot password".')
        return value

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data['email'],
            password=validated_data['password'],
        )
        if validated_data.get('is_active') is False:
            user.is_active = False
            user.save(update_fields=['is_active'])
        return user


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email']
