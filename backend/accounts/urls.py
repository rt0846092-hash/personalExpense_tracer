from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView, TokenBlacklistView

from .views import MeView, RegisterView, ThrottledLoginView

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    path('login/', ThrottledLoginView.as_view(), name='login'),          # POST username+password -> {access, refresh}
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('logout/', TokenBlacklistView.as_view(), name='logout'),         # POST {refresh} -> invalidates it
    path('me/', MeView.as_view(), name='me'),
]
