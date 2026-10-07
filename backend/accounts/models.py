from django.conf import settings
from django.db import models


class EmailCode(models.Model):
    """A 6-digit code emailed to someone, to confirm their email or reset a password.

    Only a hash of the code is stored, so a leaked database doesn't leak working codes.
    """

    class Purpose(models.TextChoices):
        VERIFY = 'verify', 'Confirm email'
        RESET = 'reset', 'Reset password'

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='email_codes')
    purpose = models.CharField(max_length=10, choices=Purpose.choices)
    code_hash = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['user', 'purpose', 'used_at'])]

    def __str__(self):
        return f'{self.get_purpose_display()} code for {self.user}'
