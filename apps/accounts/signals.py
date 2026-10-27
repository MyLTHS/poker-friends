from allauth.socialaccount.signals import social_account_added
from django.dispatch import receiver

from .services import finish_google_upgrade


@receiver(social_account_added)
def upgrade_guest_after_google(request, sociallogin, **kwargs):
    user = sociallogin.user
    if not user.is_guest:
        return
    verified = [address.email for address in sociallogin.email_addresses if address.verified]
    email = verified[0] if verified else sociallogin.account.extra_data.get("email", "")
    finish_google_upgrade(user, email)
