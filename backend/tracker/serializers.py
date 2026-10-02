import re

from rest_framework import serializers
from .models import Record, Category, OpeningBalance, UserPreference


CURRENCY_CODE = re.compile(r'^[A-Z]{3}$')


def clean_currency(value, allow_blank=False):
    """Currencies are 3-letter ISO codes like NPR, USD, KRW. Anything else
    would break the exchange-rate conversion on the dashboard."""
    value = (value or '').strip().upper()
    if allow_blank and not value:
        return value
    if not CURRENCY_CODE.match(value):
        raise serializers.ValidationError('Use a 3-letter currency code, like NPR, USD or KRW.')
    return value


class RecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = Record
        fields = [
            'id', 'type', 'account', 'to_account', 'category', 'amount', 'currency',
            'date', 'source', 'note',
            'from_country', 'to_country', 'sent_amount', 'sent_currency', 'recipient',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate_currency(self, value):
        return clean_currency(value)

    def validate_sent_currency(self, value):
        return clean_currency(value, allow_blank=True)

    def validate(self, data):
        rtype = data.get('type', getattr(self.instance, 'type', None))
        account = data.get('account', getattr(self.instance, 'account', None))
        to_account = data.get('to_account', getattr(self.instance, 'to_account', None))
        amount = data.get('amount', getattr(self.instance, 'amount', None))

        if amount is not None and amount <= 0:
            raise serializers.ValidationError({'amount': 'Amount must be greater than zero.'})

        if rtype == 'transfer':
            if not to_account:
                raise serializers.ValidationError({'to_account': 'A transfer needs a destination account.'})
            if to_account == account:
                raise serializers.ValidationError({'to_account': 'From and To accounts must be different.'})
        elif 'to_account' in data or 'type' in data:
            # Only transfers move money between accounts; don't store a stray destination
            data['to_account'] = None

        if rtype == 'remittance':
            sent_amount = data.get('sent_amount', getattr(self.instance, 'sent_amount', None))
            if sent_amount is not None and sent_amount <= 0:
                raise serializers.ValidationError({'sent_amount': 'Sent amount must be greater than zero.'})

        return data


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'type', 'key', 'label', 'color', 'icon']

    def validate(self, data):
        # `user` isn't a form field, so the database's unique rule would crash
        # instead of giving a message. Check it here first.
        user = self.context['request'].user
        rtype = data.get('type', getattr(self.instance, 'type', None))
        key = data.get('key', getattr(self.instance, 'key', None))
        clash = Category.objects.filter(user=user, type=rtype, key=key)
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError({'key': f'You already have a {rtype} category called "{key}".'})
        return data


class OpeningBalanceSerializer(serializers.ModelSerializer):
    class Meta:
        model = OpeningBalance
        fields = ['digital', 'cash', 'currency']

    def validate_currency(self, value):
        return clean_currency(value)


class UserPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserPreference
        fields = ['display_currency']

    def validate_display_currency(self, value):
        return clean_currency(value)