from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import RecordViewSet, CategoryViewSet, OpeningBalanceView, UserPreferenceView

router = DefaultRouter()
router.register('records', RecordViewSet, basename='record')
router.register('categories', CategoryViewSet, basename='category')

urlpatterns = [
    path('', include(router.urls)),
    path('opening-balance/', OpeningBalanceView.as_view(), name='opening-balance'),
    path('preferences/', UserPreferenceView.as_view(), name='preferences'),
]
