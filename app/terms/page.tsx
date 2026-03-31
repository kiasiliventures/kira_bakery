import type { Metadata } from "next";
import type { ComponentProps } from "react";
import { LegalDocumentPage } from "@/components/legal/legal-document-page";

const termsSections = [
  {
    title: "1. Use of the Service",
    body: [
      "Kira Bakery provides an online platform that allows users to browse products, create accounts, place orders, and interact with bakery-related services.",
      "You agree to use the service only for lawful purposes and in a way that does not interfere with the normal operation of the platform.",
    ],
  },
  {
    title: "2. Accounts",
    body: [
      "You may be able to create an account or sign in using supported authentication methods, including Google sign-in.",
      "You are responsible for activity that occurs under your account and for using the service in a lawful and responsible manner.",
    ],
  },
  {
    title: "3. Orders",
    body: [
      "When you place an order through Kira Bakery, you agree that the information you provide is accurate and complete.",
      "Orders are subject to acceptance, availability, operational constraints, and successful payment confirmation where payment is required.",
    ],
  },
  {
    title: "4. Payments",
    body: [
      "Payments may be processed through supported third-party payment providers.",
      "Kira Bakery may rely on payment confirmation, verification results, and related transaction checks before treating an order as confirmed.",
    ],
  },
  {
    title: "5. Cancellations and Order Changes",
    body: [
      "Cancellation and modification of orders may depend on timing, preparation status, payment status, and operational considerations.",
      "Kira Bakery reserves the right to decline, cancel, or adjust orders where reasonably necessary for operational, safety, fraud-prevention, or service-related reasons.",
    ],
  },
  {
    title: "6. Service Availability",
    body: [
      "We aim to keep the service available and functioning properly, but we do not guarantee uninterrupted or error-free operation.",
      "The service may be suspended, restricted, or modified from time to time for maintenance, updates, security reasons, or other operational reasons.",
    ],
  },
  {
    title: "7. Acceptable Use",
    body: [
      "You agree not to:",
      "Use the service for unlawful, fraudulent, or abusive purposes.",
      "Interfere with or disrupt the platform.",
      "Attempt unauthorized access to accounts, systems, or data.",
      "Misrepresent your identity or order information.",
      "Use automated means to abuse or overload the service.",
    ],
  },
  {
    title: "8. Intellectual Property",
    body: [
      "The Kira Bakery website, branding, content, and platform materials are owned by or licensed to Kira Bakery unless otherwise stated.",
      "You may not copy, reproduce, distribute, or misuse platform content except as permitted by law or with permission.",
    ],
  },
  {
    title: "9. Limitation of Liability",
    body: [
      "To the maximum extent permitted by law, Kira Bakery is not liable for indirect, incidental, special, consequential, or punitive damages, or for loss of profits, revenue, data, or goodwill arising from your use of the service.",
      "Nothing in these Terms limits liability where such limitation is not allowed by applicable law.",
    ],
  },
  {
    title: "10. Changes to the Service or Terms",
    body: [
      "We may update, change, or discontinue parts of the service at any time.",
      "We may also update these Terms from time to time. Continued use of the service after updated Terms are posted means you accept the revised Terms.",
    ],
  },
  {
    title: "11. Termination",
    body: [
      "We may suspend or restrict access to the service where reasonably necessary, including for violations of these Terms, security concerns, fraud prevention, or operational reasons.",
    ],
  },
  {
    title: "12. Governing Use",
    body: [
      "You are responsible for using the service in compliance with applicable laws and regulations.",
    ],
  },
  {
    title: "13. Contact",
    body: [
      "If you have questions about these Terms, please contact us at:",
      "support@kirabakery.com",
    ],
  },
] satisfies ComponentProps<typeof LegalDocumentPage>["sections"];

export const metadata: Metadata = {
  title: "Terms of Service | KiRA Bakery",
  description: "Public terms of service page for the KiRA Bakery storefront.",
};

export default function TermsPage() {
  return (
    <LegalDocumentPage
      title="Terms of Service"
      description={
        "These Terms of Service (\"Terms\") govern your use of the Kira Bakery website and related services. By accessing or using Kira Bakery, you agree to these Terms."
      }
      lastUpdated="March 31, 2026"
      sections={termsSections}
    />
  );
}
