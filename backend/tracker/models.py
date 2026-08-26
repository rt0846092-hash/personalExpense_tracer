import uuid
from django.conf import settings
from django.db import models


class TransactionType(models.TextChoices):
    INCOME = 'income', 'Income'
    EXPENSE = 'expense', 'Expense'
    TRANSFER = 'transfer', 'Transfer'
    REMITTANCE = 'remittance', 'Remittance'


class Account(models.TextChoices):
    DIGITAL = 'digital', 'Digital'
    CASH = 'cash', 'Cash'


class Record(models.Model):
    """A single ledger entry: income, expense, inter-account transfer, or a
    cross-border remittance. Scoped to a user so the same account can be
    signed into from multiple devices and always see the same data."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='records')

    type = models.CharField(max_length=12, choices=TransactionType.choices)
    account = models.CharField(max_length=10, choices=Account.choices)
    to_account = models.CharField(max_length=10, choices=Account.choices, null=True, blank=True)
    category = models.CharField(max_length=50, blank=True, default='')

    amount = models.DecimalField(max_digits=14, decimal_places=2)
    # Currency the `amount` above was actually entered/spent in (e.g. a
    # traveler logging a USD purchase). Everything gets converted to the
    # user's chosen display currency in the UI via live exchange rates.
    currency = models.CharField(max_length=8, default='NPR')

    date = models.DateField()
    source = models.CharField(max_length=255, blank=True, default='')
    note = models.TextField(blank=True, default='')

    # --- Remittance-only fields (type == 'remittance') ---
    # Generic "money sent from one country to another" — not Nepal-specific.
    # `amount`/`currency` above represent what was RECEIVED; these represent
    # what was SENT. The gap between the two (after currency conversion) is
    # the transfer fee / exchange spread.
    from_country = models.CharField(max_length=100, blank=True, default='')
    to_country = models.CharField(max_length=100, blank=True, default='')
    sent_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    sent_currency = models.CharField(max_length=8, blank=True, default='')
    recipient = models.CharField(max_length=255, blank=True, default='')

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-date', '-created_at']
        indexes = [
            models.Index(fields=['user', 'type']),
            models.Index(fields=['user', 'date']),
            models.Index(fields=['user', 'account']),
        ]

    def __str__(self):
        return f'{self.type} · {self.amount} {self.currency} · {self.date}'


class Category(models.Model):
    """User-created custom categories. Built-in defaults (Salary, Food, etc.)
    live as constants on the frontend, same as the original app."""

    CATEGORY_TYPE_CHOICES = [('income', 'Income'), ('expense', 'Expense')]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='categories')
    type = models.CharField(max_length=10, choices=CATEGORY_TYPE_CHOICES)
    key = models.SlugField(max_length=50)
    label = models.CharField(max_length=100)
    color = models.CharField(max_length=20, default='#6b7280')
    icon = models.CharField(max_length=10, default='🏷️')

    class Meta:
        unique_together = ('user', 'type', 'key')
        verbose_name_plural = 'categories'

    def __str__(self):
        return f'{self.user_id}:{self.type}:{self.key}'


class OpeningBalance(models.Model):
    """One row per user holding what each account had before tracking
    started, same role as KEY_OPENING in the old app — now per-account
    instead of a single shared singleton."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='opening_balance')
    digital = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    cash = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    # Currency these figures were entered in. Without this the UI had no
    # way to convert them, so switching display currency converted every
    # record but left the opening balances at their raw value — making
    # every account balance wrong.
    currency = models.CharField(max_length=8, default='NPR')

    def __str__(self):
        return f'Opening balances · {self.user_id}'


class UserPreference(models.Model):
    """Per-user display settings — currently just the currency everything
    gets converted to for display (dashboard totals, history amounts,
    etc). The underlying records keep whatever currency they were
    actually entered in."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='preference')
    display_currency = models.CharField(max_length=8, default='NPR')

    def __str__(self):
        return f'Preferences · {self.user_id}'