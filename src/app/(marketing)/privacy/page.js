import MarketingNav from "../_components/MarketingNav";
import MarketingFooter from "../_components/MarketingFooter";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-on-surface flex flex-col">
      <MarketingNav />

      <main className="pt-24 pb-16 px-6 flex-1">
        <div className="max-w-3xl mx-auto">
          <h1 className="font-headline text-4xl md:text-5xl font-bold mb-4">
            Privacy <span className="text-primary">Policy</span>
          </h1>
          <p className="text-on-surface-variant text-sm mb-12">Last updated: May 2026</p>

          <div className="prose prose-invert max-w-none space-y-8 mb-20">
            <section>
              <h2 className="font-headline text-xl font-bold mb-3">1. Data Controller</h2>
              <p className="text-on-surface-variant text-sm leading-relaxed">
                LuxJD GmbH (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) is responsible for the processing
                of your personal data. We are registered in Germany and comply with the
                EU General Data Protection Regulation (GDPR) and German Bundesdatenschutzgesetz (BDSG).
              </p>
            </section>

            <section>
              <h2 className="font-headline text-xl font-bold mb-3">2. Data We Collect</h2>
              <p className="text-on-surface-variant text-sm leading-relaxed mb-3">When you contact us or use our services, we may collect:</p>
              <ul className="text-on-surface-variant text-sm space-y-1 list-disc list-inside">
                <li>Name, email address, phone number (from inquiry forms)</li>
                <li>Vehicle preferences and purchase interests</li>
                <li>Communication records (emails, messages)</li>
                <li>IP address and browser information (website analytics)</li>
                <li>Payment and transaction data (for vehicle purchases)</li>
              </ul>
            </section>

            <section>
              <h2 className="font-headline text-xl font-bold mb-3">3. How We Use Your Data</h2>
              <ul className="text-on-surface-variant text-sm space-y-1 list-disc list-inside">
                <li>Responding to your inquiries about vehicles</li>
                <li>Processing vehicle purchase transactions</li>
                <li>Providing customer service and support</li>
                <li>Sending relevant vehicle notifications (with your consent)</li>
                <li>Improving our services and website experience</li>
                <li>Complying with legal obligations (tax, trade regulations)</li>
              </ul>
            </section>

            <section>
              <h2 className="font-headline text-xl font-bold mb-3">4. AI-Powered Communication</h2>
              <p className="text-on-surface-variant text-sm leading-relaxed">
                Our customer communication system uses artificial intelligence to generate
                personalized responses to your inquiries. AI-generated responses are reviewed
                for quality and accuracy. For complex matters (price negotiations, legal questions,
                trade-in proposals), a human specialist handles your inquiry directly.
                You may request human-only communication at any time.
              </p>
            </section>

            <section>
              <h2 className="font-headline text-xl font-bold mb-3">5. Data Sharing</h2>
              <p className="text-on-surface-variant text-sm leading-relaxed">
                We do not sell your personal data. We may share data with: shipping and logistics
                partners (for vehicle delivery), payment processors (for transactions), TUV
                inspection services (for vehicle registration), and legal authorities (when
                required by law). All third-party data processors are GDPR-compliant.
              </p>
            </section>

            <section>
              <h2 className="font-headline text-xl font-bold mb-3">6. Data Retention</h2>
              <p className="text-on-surface-variant text-sm leading-relaxed">
                Inquiry data is retained for 24 months after last contact. Transaction data
                is retained for 10 years (German tax law requirement — Abgabenordnung §147).
                You may request deletion of non-legally-required data at any time.
              </p>
            </section>

            <section>
              <h2 className="font-headline text-xl font-bold mb-3">7. Your Rights (GDPR)</h2>
              <p className="text-on-surface-variant text-sm leading-relaxed mb-3">Under EU GDPR, you have the right to:</p>
              <ul className="text-on-surface-variant text-sm space-y-1 list-disc list-inside">
                <li>Access your personal data (Art. 15 GDPR)</li>
                <li>Rectify inaccurate data (Art. 16 GDPR)</li>
                <li>Erase your data — &quot;right to be forgotten&quot; (Art. 17 GDPR)</li>
                <li>Restrict processing (Art. 18 GDPR)</li>
                <li>Data portability (Art. 20 GDPR)</li>
                <li>Object to processing (Art. 21 GDPR)</li>
                <li>Lodge a complaint with a supervisory authority</li>
              </ul>
            </section>

            <section>
              <h2 className="font-headline text-xl font-bold mb-3">8. Widerrufsrecht (Right of Withdrawal)</h2>
              <p className="text-on-surface-variant text-sm leading-relaxed">
                For online vehicle purchases, you have a 14-day right of withdrawal
                (Widerrufsrecht) per the Fernabsatzgesetz. Detailed withdrawal instructions
                (Widerrufsbelehrung) are provided with every purchase contract.
              </p>
            </section>

            <section>
              <h2 className="font-headline text-xl font-bold mb-3">9. Contact</h2>
              <p className="text-on-surface-variant text-sm leading-relaxed">
                For privacy-related inquiries: datenschutz@luxjd.com<br />
                Data Protection Officer: Available upon request<br />
                Supervisory authority: Landesbeauftragte für Datenschutz
              </p>
            </section>
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
