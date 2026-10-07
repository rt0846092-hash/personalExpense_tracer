import re
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .models import EmailCode

User = get_user_model()
EMAIL_ON = dict(BREVO_API_KEY='', EMAIL_HOST_PASSWORD='app-password', EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')


def last_code():
    return re.search(r'\b(\d{6})\b', mail.outbox[-1].body).group(1)


class AuthTestCase(TestCase):
    def setUp(self):
        cache.clear()  # reset rate limits
        self.c = APIClient()

    def post(self, path, body):
        return self.c.post(f'/api/auth/{path}', body, format='json')

    def signup(self, username='roshan', email='r@example.com', password='Strong-Pass-123'):
        return self.post('register/', {'username': username, 'email': email, 'password': password})


class LoginTests(AuthTestCase):
    def test_login_with_username_or_email(self):
        User.objects.create_user('roshan', 'R@Example.com', 'Strong-Pass-123')
        for ident in ['roshan', 'r@example.com']:
            self.assertEqual(self.post('login/', {'username': ident, 'password': 'Strong-Pass-123'}).status_code, 200, ident)

    def test_password_guessing_is_blocked(self):
        codes = [self.post('login/', {'username': 'x', 'password': f'g{i}'}).status_code for i in range(12)]
        self.assertIn(429, codes)

    def test_existing_accounts_keep_working_without_a_code(self):
        User.objects.create_user('old', 'old@example.com', 'Strong-Pass-123')
        self.assertEqual(self.post('login/', {'username': 'old', 'password': 'Strong-Pass-123'}).status_code, 200)


@override_settings(**EMAIL_ON)
class SignupWithCodeTests(AuthTestCase):
    def test_signup_sends_a_code_and_account_waits_for_it(self):
        res = self.signup()
        self.assertEqual(res.status_code, 201)
        self.assertTrue(res.data['verification_required'])
        self.assertNotIn('access', res.data)
        self.assertEqual(mail.outbox[0].to, ['r@example.com'])
        # Can't sign in yet, and is told why
        res = self.post('login/', {'username': 'roshan', 'password': 'Strong-Pass-123'})
        self.assertEqual(res.status_code, 403)
        self.assertEqual(res.data['code'], 'email_not_verified')
        # The right code unlocks it and signs in
        res = self.post('verify-email/', {'email': 'r@example.com', 'code': last_code()})
        self.assertEqual(res.status_code, 200)
        self.assertIn('access', res.data)
        self.assertEqual(self.post('login/', {'username': 'roshan', 'password': 'Strong-Pass-123'}).status_code, 200)

    def test_unverified_account_with_wrong_password_just_says_wrong_password(self):
        self.signup()
        self.assertEqual(self.post('login/', {'username': 'roshan', 'password': 'nope'}).status_code, 401)

    def test_email_is_required(self):
        self.assertEqual(self.post('register/', {'username': 'a', 'password': 'Strong-Pass-123'}).status_code, 400)

    def test_five_wrong_codes_kill_the_code(self):
        self.signup()
        code = last_code()
        wrong = '000000' if code != '000000' else '111111'
        for _ in range(5):
            self.assertEqual(self.post('verify-email/', {'email': 'r@example.com', 'code': wrong}).status_code, 400)
        res = self.post('verify-email/', {'email': 'r@example.com', 'code': code})
        self.assertEqual(res.status_code, 400)  # even the right code is refused now
        self.assertIn('expired', res.data['detail'])

    def test_expired_code(self):
        self.signup()
        EmailCode.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.post('verify-email/', {'email': 'r@example.com', 'code': last_code()}).status_code, 400)

    def test_resend_waits_a_minute_and_new_code_replaces_old(self):
        self.signup()
        first = last_code()
        self.assertEqual(self.post('resend-code/', {'email': 'r@example.com'}).status_code, 429)
        EmailCode.objects.update(created_at=timezone.now() - timedelta(minutes=2))
        self.assertEqual(self.post('resend-code/', {'email': 'r@example.com'}).status_code, 200)
        second = last_code()
        if first != second:
            self.assertEqual(self.post('verify-email/', {'email': 'r@example.com', 'code': first}).status_code, 400)
        self.assertEqual(self.post('verify-email/', {'email': 'r@example.com', 'code': second}).status_code, 200)

    def test_codes_are_not_stored_in_plain_text(self):
        self.signup()
        self.assertNotEqual(EmailCode.objects.get().code_hash, last_code())

    def test_abandoned_signup_doesnt_block_the_email_forever(self):
        self.signup()
        self.assertEqual(self.signup(username='other').status_code, 400)  # code still valid: protected
        EmailCode.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.signup(username='other').status_code, 201)

    @override_settings(EMAIL_HOST_PASSWORD='', BREVO_API_KEY='')
    def test_without_email_setup_signup_works_immediately(self):
        res = self.signup()
        self.assertIn('access', res.data)

    def test_email_failure_is_reported(self):
        with mock.patch('accounts.codes.send_mail', side_effect=OSError('blocked')):
            res = self.signup()
        self.assertEqual(res.status_code, 201)
        self.assertFalse(res.data['email_sent'])


@override_settings(**EMAIL_ON)
class BrevoTests(AuthTestCase):
    @override_settings(BREVO_API_KEY='xkeysib-test', EMAIL_SENDER='rt0846092@gmail.com', EMAIL_HOST_PASSWORD='')
    def test_codes_go_through_brevo(self):
        with mock.patch('accounts.codes.requests.post') as post:
            res = self.signup()
        self.assertTrue(res.data['email_sent'])
        sent = post.call_args
        self.assertEqual(sent.args[0], 'https://api.brevo.com/v3/smtp/email')
        self.assertEqual(sent.kwargs['headers']['api-key'], 'xkeysib-test')
        self.assertEqual(sent.kwargs['json']['to'], [{'email': 'r@example.com'}])
        self.assertEqual(sent.kwargs['json']['sender']['email'], 'rt0846092@gmail.com')
        self.assertRegex(sent.kwargs['json']['subject'], r'^\d{6} is your')

    @override_settings(BREVO_API_KEY='bad-key', EMAIL_HOST_PASSWORD='')
    def test_brevo_error_is_reported_not_crashed(self):
        import requests
        failing = mock.Mock(**{'raise_for_status.side_effect': requests.HTTPError('401 Unauthorized')})
        with mock.patch('accounts.codes.requests.post', return_value=failing):
            res = self.signup()
        self.assertEqual(res.status_code, 201)
        self.assertFalse(res.data['email_sent'])


@override_settings(**EMAIL_ON)
class PasswordResetTests(AuthTestCase):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user('roshan', 'r@example.com', 'Old-Pass-123x')

    def test_reset_flow_logs_out_other_devices(self):
        old = self.post('login/', {'username': 'roshan', 'password': 'Old-Pass-123x'}).data
        self.assertEqual(self.post('password-reset/', {'email': 'R@example.com'}).status_code, 200)
        res = self.post('password-reset/confirm/', {'email': 'r@example.com', 'code': last_code(), 'new_password': 'New-Pass-456y'})
        self.assertEqual(res.status_code, 200)
        self.assertIn('access', res.data)
        self.assertEqual(self.post('login/', {'username': 'roshan', 'password': 'New-Pass-456y'}).status_code, 200)
        self.assertEqual(self.post('login/', {'username': 'roshan', 'password': 'Old-Pass-123x'}).status_code, 401)
        self.assertEqual(self.post('token/refresh/', {'refresh': old['refresh']}).status_code, 401)

    def test_unknown_email_gets_the_same_answer(self):
        known = self.post('password-reset/', {'email': 'r@example.com'})
        unknown = self.post('password-reset/', {'email': 'nobody@example.com'})
        self.assertEqual((known.status_code, known.data), (unknown.status_code, unknown.data))
        self.assertEqual(len(mail.outbox), 1)

    def test_weak_new_password_is_refused_and_code_is_kept(self):
        self.post('password-reset/', {'email': 'r@example.com'})
        code = last_code()
        res = self.post('password-reset/confirm/', {'email': 'r@example.com', 'code': code, 'new_password': '12345678'})
        self.assertEqual(res.status_code, 400)
        res = self.post('password-reset/confirm/', {'email': 'r@example.com', 'code': code, 'new_password': 'New-Pass-456y'})
        self.assertEqual(res.status_code, 200)

    def test_code_works_only_once(self):
        self.post('password-reset/', {'email': 'r@example.com'})
        code = last_code()
        self.post('password-reset/confirm/', {'email': 'r@example.com', 'code': code, 'new_password': 'New-Pass-456y'})
        res = self.post('password-reset/confirm/', {'email': 'r@example.com', 'code': code, 'new_password': 'Other-Pass-789z'})
        self.assertEqual(res.status_code, 400)

    def test_signup_code_cant_reset_a_password(self):
        self.post('password-reset/', {'email': 'r@example.com'})
        EmailCode.objects.update(purpose='verify')
        res = self.post('password-reset/confirm/', {'email': 'r@example.com', 'code': last_code(), 'new_password': 'New-Pass-456y'})
        self.assertEqual(res.status_code, 400)


class GoogleLoginTests(AuthTestCase):
    def google(self, info):
        with mock.patch('google.oauth2.id_token.verify_oauth2_token', return_value=info) as verify:
            res = self.post('google/', {'credential': 'signed-token-from-google'})
        return res, verify

    def test_new_google_user_gets_an_account_with_a_username(self):
        res, verify = self.google({'email': 'Roshan.T@gmail.com', 'email_verified': True})
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.data['user']['username'], 'roshan.t')
        self.assertFalse(User.objects.get(username='roshan.t').has_usable_password())
        # Checked against our own Client ID, so tokens made for other apps are refused
        self.assertEqual(verify.call_args.args[2], '53564908495-mlk1m58b96tifkmjuprr9rjaijm9n28l.apps.googleusercontent.com')

    def test_existing_account_with_that_email_is_signed_in(self):
        User.objects.create_user('roshan', 'rt@gmail.com', 'Strong-Pass-123')
        res, _ = self.google({'email': 'RT@gmail.com', 'email_verified': True})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['user']['username'], 'roshan')
        self.assertEqual(User.objects.count(), 1)

    def test_username_clash_gets_a_number(self):
        User.objects.create_user('roshan', 'other@example.com', 'Strong-Pass-123')
        res, _ = self.google({'email': 'roshan@gmail.com', 'email_verified': True})
        self.assertEqual(res.data['user']['username'], 'roshan2')

    def test_unverified_google_email_refused(self):
        res, _ = self.google({'email': 'x@gmail.com', 'email_verified': False})
        self.assertEqual(res.status_code, 400)

    def test_fake_token_refused(self):
        with mock.patch('google.oauth2.id_token.verify_oauth2_token', side_effect=ValueError('bad signature')):
            res = self.post('google/', {'credential': 'forged'})
        self.assertEqual(res.status_code, 400)

    def test_turned_off_account_stays_off(self):
        User.objects.create_user('roshan', 'rt@gmail.com', 'Strong-Pass-123', is_active=False)
        res, _ = self.google({'email': 'rt@gmail.com', 'email_verified': True})
        self.assertEqual(res.status_code, 403)

    @override_settings(**EMAIL_ON)
    def test_google_finishes_a_pending_signup(self):
        self.signup(email='rt@gmail.com')
        res, _ = self.google({'email': 'rt@gmail.com', 'email_verified': True})
        self.assertEqual(res.status_code, 200)
        self.assertTrue(User.objects.get(username='roshan').is_active)
