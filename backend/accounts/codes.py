"""Creating, emailing and checking the 6-digit codes."""
import hashlib
import hmac
import logging
import secrets
from datetime import timedelta

from django.conf import settings
import requests
from django.core.mail import send_mail
from django.utils import timezone

from .models import EmailCode

log = logging.getLogger(__name__)

CODE_LIFETIME = timedelta(minutes=10)
MAX_ATTEMPTS = 5
RESEND_WAIT = timedelta(seconds=60)


class CodeError(Exception):
    """The code is wrong, expired or used up. The message is safe to show."""


def _hash(code):
    return hmac.new(settings.SECRET_KEY.encode(), code.encode(), hashlib.sha256).hexdigest()


def email_configured():
    return bool(settings.BREVO_API_KEY or settings.EMAIL_HOST_PASSWORD)


def deliver(to, subject, body):
    """Send one email. Brevo works over HTTPS, which free Render servers allow;
    plain SMTP (Gmail) is kept for local use or paid servers."""
    if settings.BREVO_API_KEY:
        res = requests.post(
            'https://api.brevo.com/v3/smtp/email',
            headers={'api-key': settings.BREVO_API_KEY, 'accept': 'application/json'},
            json={'sender': {'name': settings.EMAIL_SENDER_NAME, 'email': settings.EMAIL_SENDER},
                  'to': [{'email': to}], 'subject': subject, 'textContent': body},
            timeout=10,
        )
        res.raise_for_status()
    else:
        send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [to])


def seconds_until_resend(user, purpose):
    last = EmailCode.objects.filter(user=user, purpose=purpose).first()
    if not last:
        return 0
    wait = (last.created_at + RESEND_WAIT - timezone.now()).total_seconds()
    return max(0, int(wait) + 1)


def send_code(user, purpose):
    """Make a new code (cancelling older ones) and email it. Returns True if the email went out."""
    EmailCode.objects.filter(user=user, purpose=purpose, used_at__isnull=True).update(used_at=timezone.now())
    code = f'{secrets.randbelow(1_000_000):06d}'
    EmailCode.objects.create(user=user, purpose=purpose, code_hash=_hash(code),
                             expires_at=timezone.now() + CODE_LIFETIME)

    if purpose == EmailCode.Purpose.VERIFY:
        subject = f'{code} is your Expense Tracker code'
        reason = 'Use this code to confirm your email and finish creating your account.'
    else:
        subject = f'{code} is your password reset code'
        reason = "Use this code to set a new password. If you didn't ask for this, you can ignore this email."
    body = (
        f'Hi {user.username},\n\n{reason}\n\n    {code}\n\n'
        f'The code expires in {int(CODE_LIFETIME.total_seconds() // 60)} minutes. '
        f'Never share it with anyone.\n\n— Expense Tracker'
    )
    try:
        deliver(user.email, subject, body)
        return True
    except Exception:  # service down, wrong key, sender not confirmed, network…
        log.exception('Could not send %s code to user %s', purpose, user.pk)
        return False


def check_code(user, purpose, code):
    """Use up a correct code, or raise CodeError. Wrong guesses count against the code."""
    current = EmailCode.objects.filter(user=user, purpose=purpose, used_at__isnull=True).first()
    if current is None or current.expires_at < timezone.now() or current.attempts >= MAX_ATTEMPTS:
        raise CodeError('This code has expired. Ask for a new one.')
    if not hmac.compare_digest(current.code_hash, _hash((code or '').strip())):
        current.attempts += 1
        current.save(update_fields=['attempts'])
        left = MAX_ATTEMPTS - current.attempts
        raise CodeError('Wrong code. ' + (f'{left} tries left.' if left else 'Ask for a new one.'))
    current.used_at = timezone.now()
    current.save(update_fields=['used_at'])


def is_pending_signup(user):
    """Signed up but hasn't confirmed their email yet (unlike an account an admin turned off)."""
    return not user.is_active and EmailCode.objects.filter(user=user, purpose=EmailCode.Purpose.VERIFY).exists()
