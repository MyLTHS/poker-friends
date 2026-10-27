"""Console email backend that prints plain text, so links in Vietnamese emails stay readable.

Django's own console backend prints the raw MIME message, and a mostly non-ASCII body comes out
base64-encoded: the verification link would be unreadable in the runserver output.
"""

from django.core.mail.backends.console import EmailBackend as DjangoConsoleBackend


class EmailBackend(DjangoConsoleBackend):
    def write_message(self, message):
        self.stream.write(
            f"From: {message.from_email}\n"
            f"To: {', '.join(message.to)}\n"
            f"Subject: {message.subject}\n\n"
            f"{message.body}\n"
        )
        self.stream.write("-" * 79 + "\n")
