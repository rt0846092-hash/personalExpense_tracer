from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient


class AuthTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_register_login_and_me(self):
        c = APIClient()
        res = c.post("/api/auth/register/", {"username": "roshan", "email": "r@example.com",
                                             "password": "Strong-Pass-123", "password2": "Strong-Pass-123"}, format="json")
        self.assertEqual(res.status_code, 201, res.data)
        res = c.post("/api/auth/login/", {"username": "roshan", "password": "Strong-Pass-123"}, format="json")
        self.assertEqual(res.status_code, 200)
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {res.data['access']}")
        self.assertEqual(c.get("/api/auth/me/").data["username"], "roshan")

    def test_password_guessing_is_blocked(self):
        c = APIClient()
        codes = [c.post("/api/auth/login/", {"username": "roshan", "password": f"guess{i}"}, format="json").status_code
                 for i in range(12)]
        self.assertIn(429, codes)
