from django.contrib import admin
from .models import Record, Category, OpeningBalance, UserPreference


@admin.register(Record)
class RecordAdmin(admin.ModelAdmin):
    list_display = ('user', 'type', 'account', 'to_account', 'category', 'amount', 'currency', 'date', 'source')
    list_filter = ('type', 'account', 'currency')
    search_fields = ('source', 'note', 'recipient', 'user__username')
    date_hierarchy = 'date'


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('user', 'type', 'key', 'label', 'color', 'icon')
    list_filter = ('type',)


@admin.register(OpeningBalance)
class OpeningBalanceAdmin(admin.ModelAdmin):
    list_display = ('user', 'digital', 'cash', 'currency')


@admin.register(UserPreference)
class UserPreferenceAdmin(admin.ModelAdmin):
    list_display = ('user', 'display_currency')