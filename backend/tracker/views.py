import datetime

from rest_framework import viewsets, filters
from django.db import transaction
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.views import APIView
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from .models import Record, Category, OpeningBalance, UserPreference, Loan, LoanPayment
from .serializers import (
    RecordSerializer, CategorySerializer, OpeningBalanceSerializer, UserPreferenceSerializer,
    LoanSerializer, LoanPaymentSerializer,
)


def _parse_date(value, name):
    """Turn a YYYY-MM-DD query parameter into a date, or explain what's wrong."""
    try:
        return datetime.date.fromisoformat(value)
    except ValueError:
        raise ValidationError({name: 'Use a real date in the format YYYY-MM-DD.'})


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
            qs = qs.filter(date__gte=_parse_date(date_from, 'date_from'))
        if date_to:
            qs = qs.filter(date__lte=_parse_date(date_to, 'date_to'))
        if month:
            try:
                first = datetime.datetime.strptime(month, '%Y-%m').date()
            except ValueError:
                raise ValidationError({'month': 'Use the format YYYY-MM, for example 2026-10.'})
            qs = qs.filter(date__year=first.year, date__month=first.month)
        if account_any:
            from django.db.models import Q
            qs = qs.filter(Q(account=account_any) | Q(to_account=account_any))

        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    # Entries made by a loan move the balance, so they're only changed from Borrow / Lend
    def perform_update(self, serializer):
        if serializer.instance.loan_id:
            raise ValidationError({'detail': 'This entry belongs to a loan. Change it in Borrow / Lend.'})
        serializer.save()

    def perform_destroy(self, instance):
        if instance.loan_id:
            raise ValidationError({'detail': 'This entry belongs to a loan. Change it in Borrow / Lend.'})
        instance.delete()


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



def _loan_record_fields(loan):
    """The history entry a loan creates: borrowing brings money in, lending sends it out."""
    return dict(
        user=loan.user,
        type='loan_in' if loan.direction == Loan.Direction.BORROWED else 'loan_out',
        account=loan.account, amount=loan.amount, currency=loan.currency, date=loan.date,
        category='loan', source=f'{loan.get_direction_display()} · {loan.person}', note=loan.note,
    )


def _payment_record_fields(payment):
    """Paying back reverses the direction: I repay a debt (out), or someone repays me (in)."""
    loan = payment.loan
    borrowed = loan.direction == Loan.Direction.BORROWED
    return dict(
        user=loan.user, loan=loan,
        type='loan_out' if borrowed else 'loan_in',
        account=payment.account, amount=payment.amount, currency=loan.currency, date=payment.date,
        category='loan', note=payment.note,
        source=f'Paid back to {loan.person}' if borrowed else f'{loan.person} paid back',
    )


class LoanViewSet(viewsets.ModelViewSet):
    """Borrow / Lend. Every loan and repayment also writes a history entry,
    so cash and digital balances always include them."""
    serializer_class = LoanSerializer

    def get_queryset(self):
        return Loan.objects.filter(user=self.request.user).prefetch_related('payments')

    @transaction.atomic
    def perform_create(self, serializer):
        loan = serializer.save(user=self.request.user)
        Record.objects.create(loan=loan, **_loan_record_fields(loan))

    @transaction.atomic
    def perform_update(self, serializer):
        loan = serializer.save()
        Record.objects.filter(loan=loan, loan_payment__isnull=True).update(**{
            k: v for k, v in _loan_record_fields(loan).items() if k != 'user'
        })
        # Payments keep the loan's currency and follow the person's name
        for payment in loan.payments.all():
            Record.objects.filter(loan_payment=payment).update(
                currency=loan.currency, source=_payment_record_fields(payment)['source'])

    @action(detail=True, methods=['post'], url_path='payments')
    def add_payment(self, request, pk=None):
        loan = self.get_object()
        serializer = LoanPaymentSerializer(data=request.data, context={'loan': loan})
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            payment = serializer.save(loan=loan)
            Record.objects.create(loan_payment=payment, **_payment_record_fields(payment))
        loan.refresh_from_db()
        return Response(LoanSerializer(loan).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'], url_path=r'payments/(?P<payment_id>\d+)')
    def delete_payment(self, request, pk=None, payment_id=None):
        loan = self.get_object()
        payment = loan.payments.filter(pk=payment_id).first()
        if payment is None:
            return Response({'detail': 'Payment not found.'}, status=status.HTTP_404_NOT_FOUND)
        payment.delete()  # its history entry is removed with it
        loan.refresh_from_db()
        return Response(LoanSerializer(loan).data)
