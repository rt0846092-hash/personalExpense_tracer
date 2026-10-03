from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Record

User = get_user_model()
RECORD = {"type": "expense", "account": "cash", "amount": "12.50", "currency": "USD", "date": "2026-10-01", "category": "food"}


class TrackerTestCase(TestCase):
    def setUp(self):
        cache.clear()  # reset rate limits between tests
        self.me = User.objects.create_user("me", "me@example.com", "Strong-Pass-123")
        self.other = User.objects.create_user("other", "other@example.com", "Strong-Pass-123")
        self.client = APIClient()
        self.client.force_authenticate(self.me)

    def add(self, **changes):
        return self.client.post("/api/records/", {**RECORD, **changes}, format="json")


class PrivacyTests(TrackerTestCase):
    def test_login_required(self):
        self.assertEqual(APIClient().get("/api/records/").status_code, 401)

    def test_users_only_see_their_own_records(self):
        mine = self.add().data["id"]
        theirs = Record.objects.create(user=self.other, type="expense", account="cash", amount=5, date="2026-10-01")
        ids = [r["id"] for r in self.client.get("/api/records/").data["results"]]
        self.assertEqual(ids, [mine])
        self.assertEqual(self.client.get(f"/api/records/{theirs.id}/").status_code, 404)
        self.assertEqual(self.client.delete(f"/api/records/{theirs.id}/").status_code, 404)
        self.assertTrue(Record.objects.filter(pk=theirs.id).exists())

    def test_cannot_create_a_record_for_someone_else(self):
        rid = self.add(user=self.other.id).data["id"]
        self.assertEqual(Record.objects.get(pk=rid).user, self.me)


class FilterTests(TrackerTestCase):
    def test_bad_month_and_dates_give_a_clear_error(self):
        for query, field in [("month=abc", "month"), ("month=2026-13", "month"),
                             ("date_from=notadate", "date_from"), ("date_to=2026-02-30", "date_to")]:
            res = self.client.get(f"/api/records/?{query}")
            self.assertEqual(res.status_code, 400, query)
            self.assertIn(field, res.data)

    def test_month_filter(self):
        self.add(date="2026-10-05")
        self.add(date="2026-09-30")
        res = self.client.get("/api/records/?month=2026-10")
        self.assertEqual([r["date"] for r in res.data["results"]], ["2026-10-05"])


class RecordValidationTests(TrackerTestCase):
    def test_amount_must_be_positive(self):
        self.assertEqual(self.add(amount="0").status_code, 400)
        self.assertEqual(self.add(amount="-5").status_code, 400)

    def test_currency_must_be_a_3_letter_code(self):
        for bad in ["<script>", "zzzzzzzz", "US", "12$"]:
            self.assertEqual(self.add(currency=bad).status_code, 400, bad)
        self.assertEqual(self.add(currency=" usd ").data["currency"], "USD")

    def test_transfers(self):
        self.assertEqual(self.add(type="transfer").status_code, 400)  # needs a destination
        self.assertEqual(self.add(type="transfer", to_account="cash").status_code, 400)  # same account
        self.assertEqual(self.add(type="transfer", to_account="digital").status_code, 201)

    def test_non_transfer_drops_destination_account(self):
        self.assertIsNone(self.add(to_account="digital").data["to_account"])

    def test_remittance_import_without_sent_amount_still_works(self):
        res = self.add(type="remittance", from_country="Korea", to_country="Nepal")
        self.assertEqual(res.status_code, 201)


class CategoryAndSettingsTests(TrackerTestCase):
    def test_duplicate_category_gives_a_message_not_a_crash(self):
        body = {"type": "expense", "key": "gym", "label": "Gym"}
        self.assertEqual(self.client.post("/api/categories/", body, format="json").status_code, 201)
        res = self.client.post("/api/categories/", {**body, "label": "Gym 2"}, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("already have", str(res.data))
        # The same key is fine for another user, or as an income category
        other = APIClient(); other.force_authenticate(self.other)
        self.assertEqual(other.post("/api/categories/", body, format="json").status_code, 201)
        self.assertEqual(self.client.post("/api/categories/", {**body, "type": "income"}, format="json").status_code, 201)

    def test_currency_settings_validated(self):
        self.assertEqual(self.client.patch("/api/preferences/", {"display_currency": "zzz9"}, format="json").status_code, 400)
        self.assertEqual(self.client.patch("/api/preferences/", {"display_currency": "krw"}, format="json").data["display_currency"], "KRW")
        self.assertEqual(self.client.patch("/api/opening-balance/", {"currency": "nope"}, format="json").status_code, 400)


class LoanTests(TrackerTestCase):
    def borrow(self, **changes):
        body = {"direction": "borrowed", "person": "Suresh", "amount": "5000", "currency": "NPR",
                "account": "cash", "date": "2026-10-01", **changes}
        return self.client.post("/api/loans/", body, format="json")

    def balance_records(self):
        return list(Record.objects.filter(user=self.me).values_list("type", "amount", "account"))

    def test_borrowing_creates_a_money_in_entry(self):
        res = self.borrow()
        self.assertEqual(res.status_code, 201, res.data)
        self.assertEqual(str(res.data["remaining"]), "5000.00")
        self.assertEqual(res.data["status"], "open")
        self.assertEqual(self.balance_records(), [("loan_in", 5000, "cash")])

    def test_lending_creates_a_money_out_entry(self):
        self.borrow(direction="lent", account="digital")
        self.assertEqual(self.balance_records(), [("loan_out", 5000, "digital")])

    def test_partial_and_full_repayment(self):
        loan = self.borrow().data
        url = f"/api/loans/{loan['id']}/payments/"
        res = self.client.post(url, {"amount": "2000", "account": "digital", "date": "2026-10-05"}, format="json")
        self.assertEqual(str(res.data["remaining"]), "3000.00")
        self.assertIn(("loan_out", 2000, "digital"), self.balance_records())  # I paid back from digital
        # Can't pay more than what's left
        self.assertEqual(self.client.post(url, {"amount": "3500", "account": "cash", "date": "2026-10-06"}, format="json").status_code, 400)
        res = self.client.post(url, {"amount": "3000", "account": "cash", "date": "2026-10-06"}, format="json")
        self.assertEqual(res.data["status"], "paid")

    def test_someone_paying_me_back_is_money_in(self):
        loan = self.borrow(direction="lent").data
        self.client.post(f"/api/loans/{loan['id']}/payments/", {"amount": "1000", "account": "cash", "date": "2026-10-03"}, format="json")
        self.assertIn(("loan_in", 1000, "cash"), self.balance_records())

    def test_overdue(self):
        self.assertEqual(self.borrow(due_date="2026-01-01", date="2025-12-01").data["status"], "overdue")
        self.assertEqual(self.borrow(due_date="2026-09-01").status_code, 400)  # due before the loan date

    def test_editing_a_loan_updates_its_entry_and_deleting_removes_everything(self):
        loan = self.borrow().data
        self.client.post(f"/api/loans/{loan['id']}/payments/", {"amount": "1000", "account": "cash", "date": "2026-10-02"}, format="json")
        self.client.patch(f"/api/loans/{loan['id']}/", {"amount": "6000"}, format="json")
        self.assertIn(("loan_in", 6000, "cash"), self.balance_records())
        self.assertEqual(self.client.patch(f"/api/loans/{loan['id']}/", {"amount": "500"}, format="json").status_code, 400)  # less than already paid
        self.client.delete(f"/api/loans/{loan['id']}/")
        self.assertEqual(self.balance_records(), [])

    def test_deleting_a_payment_removes_its_entry(self):
        loan = self.borrow().data
        res = self.client.post(f"/api/loans/{loan['id']}/payments/", {"amount": "1000", "account": "cash", "date": "2026-10-02"}, format="json")
        pid = res.data["payments"][0]["id"]
        res = self.client.delete(f"/api/loans/{loan['id']}/payments/{pid}/")
        self.assertEqual(str(res.data["remaining"]), "5000.00")
        self.assertEqual(len(self.balance_records()), 1)

    def test_loan_entries_are_protected_in_history(self):
        self.borrow()
        rec = Record.objects.get(user=self.me)
        self.assertEqual(self.client.patch(f"/api/records/{rec.id}/", {"amount": "1"}, format="json").status_code, 400)
        self.assertEqual(self.client.delete(f"/api/records/{rec.id}/").status_code, 400)
        self.assertEqual(self.add(type="loan_in").status_code, 400)  # can't fake one by hand

    def test_loans_are_private(self):
        loan = self.borrow().data
        other = APIClient(); other.force_authenticate(self.other)
        self.assertEqual(other.get(f"/api/loans/{loan['id']}/").status_code, 404)
        self.assertEqual(other.post(f"/api/loans/{loan['id']}/payments/", {"amount": "1", "account": "cash", "date": "2026-10-02"}, format="json").status_code, 404)
        self.assertEqual(other.get("/api/loans/").data["results"] if isinstance(other.get("/api/loans/").data, dict) else other.get("/api/loans/").data, [])
