from rest_framework import serializers
from .models import Record, Category, OpeningBalance, UserPreference


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

        if rtype == 'remittance':
            sent_amount = data.get('sent_amount', getattr(self.instance, 'sent_amount', None))
            if sent_amount is not None and sent_amount <= 0:
                raise serializers.ValidationError({'sent_amount': 'Sent amount must be greater than zero.'})

        return data


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'type', 'key', 'label', 'color', 'icon']


class OpeningBalanceSerializer(serializers.ModelSerializer):
    class Meta:
        model = OpeningBalance
        fields = ['digital', 'cash', 'currency']


class UserPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserPreference
        fields = ['display_currency']