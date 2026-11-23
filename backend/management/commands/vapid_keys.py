import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from django.core.management.base import BaseCommand


def b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


class Command(BaseCommand):
    help = "Create the key pair push notifications need. Paste the output into .env (once)."

    def handle(self, *args, **options):
        key = ec.generate_private_key(ec.SECP256R1())
        private = key.private_numbers().private_value.to_bytes(32, "big")
        public = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
        self.stdout.write("Add these lines to .env, then restart the app:\n")
        self.stdout.write(f"VAPID_PUBLIC_KEY={b64(public)}")
        self.stdout.write(f"VAPID_PRIVATE_KEY={b64(private)}")
        self.stdout.write("VAPID_SUBJECT=mailto:hello@darlova.com")
        self.stdout.write(self.style.WARNING("\nKeep VAPID_PRIVATE_KEY secret. Don't change these keys later, "
                                             "or every phone has to turn notifications on again."))
