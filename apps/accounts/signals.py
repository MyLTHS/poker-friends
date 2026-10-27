from allauth.core.exceptions import ImmediateHttpResponse
from allauth.socialaccount.signals import social_account_added
from django.db import transaction
from django.dispatch import receiver

from .adapters import error_redirect, google_verified_email
from .services import AccountError, finish_google_upgrade


@receiver(social_account_added)
def upgrade_guest_after_google(request, sociallogin, **kwargs):
    """Google was just connected (only guests may connect): turn the guest into a member."""
    try:
        finish_google_upgrade(sociallogin.user, google_verified_email(sociallogin))
    except AccountError as error:
        # Also undo the Google link allauth saved a moment ago: the callback view runs in one
        # transaction (urls.py), and allauth turns this exception into the redirect.
        transaction.set_rollback(True)
        raise ImmediateHttpResponse(error_redirect(error.code)) from error
