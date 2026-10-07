from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView, TokenBlacklistView

from .views import (
    GoogleLoginView, MeView, PasswordResetConfirmView, PasswordResetRequestView,
    RegisterView, ResendCodeView, ThrottledLoginView, VerifyEmailView,
)

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    path('verify-email/', VerifyEmailView.as_view(), name='verify-email'),
    path('resend-code/', ResendCodeView.as_view(), name='resend-code'),
    path('login/', ThrottledLoginView.as_view(), name='login'),          # username or email + password
    path('google/', GoogleLoginView.as_view(), name='google-login'),
    path('password-reset/', PasswordResetRequestView.as_view(), name='password-reset'),
    path('password-reset/confirm/', PasswordResetConfirmView.as_view(), name='password-reset-confirm'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('logout/', TokenBlacklistView.as_view(), name='logout'),
    path('me/', MeView.as_view(), name='me'),
]
