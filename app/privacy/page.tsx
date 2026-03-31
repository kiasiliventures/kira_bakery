import type { Metadata } from "next";
import type { ComponentProps } from "react";
import { LegalDocumentPage } from "@/components/legal/legal-document-page";

const privacySections = [
  {
    title: "1. Information We Collect",
    body: [
      "We may collect the following information when you use Kira Bakery:",
      "Your name.",
      "Your email address.",
      "Your profile image, if provided by your sign-in provider.",
      "Basic account identifiers used to create and maintain your account.",
      "Order details, including items purchased and order preferences.",
      "Delivery or pickup information you provide during checkout.",
      "Technical and session information needed to keep the service secure and functioning properly.",
      "If you choose to sign in with Google, we may receive basic account information such as your name, email address, and profile image.",
      "We do not access your Gmail, Google Drive, Google Calendar, contacts, or any unrelated Google data.",
    ],
  },
  {
    title: "2. How We Use Your Information",
    body: [
      "We use your information to:",
      "Create and manage your account.",
      "Authenticate you securely.",
      "Process and manage orders.",
      "Support delivery or pickup coordination.",
      "Communicate order-related updates.",
      "Maintain platform security and prevent misuse.",
      "Improve the functionality and reliability of our services.",
    ],
  },
  {
    title: "3. Authentication and Sign-In",
    body: [
      "Kira Bakery may offer sign-in through Google using secure OAuth authentication.",
      "When you sign in using Google, authentication is handled through trusted third-party identity infrastructure. We only request the basic information necessary to identify your account and sign you in securely.",
    ],
  },
  {
    title: "4. Cookies, Sessions, and Similar Technologies",
    body: [
      "We may use cookies, secure session tokens, and similar technologies to:",
      "Keep you signed in.",
      "Maintain your session securely.",
      "Improve website functionality.",
      "Support core website and ordering features.",
      "These technologies are used for normal operation, security, and user experience.",
    ],
  },
  {
    title: "5. Orders and Delivery Information",
    body: [
      "When you place an order, we may collect and store the details required to fulfill that order, including product selections, pricing details, and delivery or pickup information you submit.",
      "This information is used only for order processing, service operations, customer support, recordkeeping, and related business purposes.",
    ],
  },
  {
    title: "6. How We Share Information",
    body: [
      "We do not sell your personal information.",
      "We may share information only when necessary to:",
      "Operate the service.",
      "Process orders.",
      "Comply with legal obligations.",
      "Protect our rights, users, or platform security.",
      "Work with service providers that support core platform operations.",
    ],
  },
  {
    title: "7. Data Retention",
    body: [
      "We retain information for as long as reasonably necessary to operate the service, maintain business records, resolve disputes, enforce our terms, and comply with legal obligations.",
    ],
  },
  {
    title: "8. Data Security",
    body: [
      "We take reasonable technical and organizational measures to protect your information against unauthorized access, misuse, loss, or disclosure.",
      "However, no internet-based service can guarantee absolute security.",
    ],
  },
  {
    title: "9. Your Choices",
    body: [
      "You may choose not to use certain features that require account information.",
      "If you believe your information is inaccurate or you want to request account-related assistance, you may contact us using the information below.",
    ],
  },
  {
    title: "10. Children's Privacy",
    body: [
      "Kira Bakery is not intended for use by children under the age required by applicable law to independently consent to online services.",
    ],
  },
  {
    title: "11. Changes to This Policy",
    body: [
      "We may update this Privacy Policy from time to time. When we do, we will post the updated version on this page and revise the \"Last updated\" date.",
    ],
  },
  {
    title: "12. Contact",
    body: [
      "If you have questions about this Privacy Policy, please contact us at:",
      "support@kirabakery.com",
    ],
  },
] satisfies ComponentProps<typeof LegalDocumentPage>["sections"];

export const metadata: Metadata = {
  title: "Privacy Policy | KiRA Bakery",
  description: "Public privacy policy page for the KiRA Bakery storefront.",
};

export default function PrivacyPage() {
  return (
    <LegalDocumentPage
      title="Privacy Policy"
      description={
        "Kira Bakery (\"we\", \"our\", or \"us\") operates the Kira Bakery website and related ordering services. This Privacy Policy explains how we collect, use, and protect your information when you use our website, create an account, sign in, or place an order."
      }
      lastUpdated="March 31, 2026"
      sections={privacySections}
    />
  );
}
