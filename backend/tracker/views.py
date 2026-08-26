from rest_framework import viewsets, filters
from rest_framework.views import APIView
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from .models import Record, Category, OpeningBalance, UserPreference
from .serializers import (
    RecordSerializer, CategorySerializer, OpeningBalanceSerializer, UserPreferenceSerializer,
)


class RecordViewSet(viewsets.ModelViewSet):
    serializer_class = RecordSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['type', 'account', 'category']
    search_fields = ['source', 'note', 'recipient', 'category', 'from_country', 'to_country']

    def get_queryset(self):
        qs = Record.objects.filter(user=self.request.user)
        params = self.request.query_params

        date_from = params.get('date_from')
        date_to = params.get('date_to')
        month = params.get('month')  # 'YYYY-MM'
        account_any = params.get('account_any')  # matches account OR to_account

        if date_from:
            qs = qs.filter(date__gte=date_from)
        if date_to:
            qs = qs.filter(date__lte=date_to)
        if month:
            year, mo = month.split('-')
            qs = qs.filter(date__year=year, date__month=mo)
        if account_any:
            from django.db.models import Q
            qs = qs.filter(Q(account=account_any) | Q(to_account=account_any))

        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class CategoryViewSet(viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['type']

    def get_queryset(self):
        return Category.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class OpeningBalanceView(APIView):
    """Per-user opening-balance resource. GET returns it (creating a
    zeroed row on first access); PUT/PATCH updates it."""

    def get_object(self):
        obj, _ = OpeningBalance.objects.get_or_create(user=self.request.user)
        return obj

    def get(self, request):
        return Response(OpeningBalanceSerializer(self.get_object()).data)

    def put(self, request):
        return self._update(request)

    def patch(self, request):
        return self._update(request)

    def _update(self, request):
        obj = self.get_object()
        serializer = OpeningBalanceSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class UserPreferenceView(APIView):
    """Per-user display settings — currently just the display currency."""

    def get_object(self):
        obj, _ = UserPreference.objects.get_or_create(user=self.request.user)
        return obj

    def get(self, request):
        return Response(UserPreferenceSerializer(self.get_object()).data)

    def put(self, request):
        return self._update(request)

    def patch(self, request):
        return self._update(request)

    def _update(self, request):
        obj = self.get_object()
        serializer = UserPreferenceSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
