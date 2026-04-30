// NDA template text + PDF generator for The Avenue / 16740 E. Ave of the Fountains LLC
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export const NDA_DISPLAY_HTML = `
<h2>Mutual Non-Disclosure Agreement</h2>
<p><strong>16740 E. Ave of the Fountains LLC</strong> and <strong>[Receiving Party]</strong></p>

<p>This agreement is entered into between <strong>16740 E. Ave of the Fountains LLC</strong>, an Arizona limited liability company, with a mailing address at 213 Debbie Ln, Corbin, KY 40701 ("Disclosing Party") and the undersigned ("Receiving Party").</p>

<h3>Purpose</h3>
<p>The parties plan to discuss a potential investment opportunity in connection with the real estate development project known as "The Avenue at Fountain Hills" (the "Project"). In the course of these discussions, it may become necessary for the parties to exchange proprietary or confidential information. The purpose of this Agreement is to protect the confidential nature of such information.</p>

<h3>Definition of Proprietary Information</h3>
<p>Subject to the exceptions listed herein, the term "Proprietary Information" means information of a confidential nature disclosed during the term of this Agreement to the designated Authorized Representative identified herein. Proprietary Information includes but is not limited to (i) research and development; (ii) trade secrets; (iii) proprietary technical, marketing, operating, performance, cost, pricing, know-how, business and process information; (iv) communications plans, creative ideas, designs, client preferences and policies; (v) hardware, software, algorithms, computer processing systems, techniques, methodologies, formulae, processes, compilations of information, drawings, proposals, job notes, reports, records and specifications; (vi) information relating to 16740 E. Ave of the Fountains LLC, AK Capital Investments, their respective principals, members, managers, subsidiaries, affiliates, and partners, and the property located at or near 16740 E. Avenue of the Fountains, Fountain Hills, Arizona, including any related development entities and equity structures; (vii) project documentation, including property appraisals, architectural and engineering plans, build budgets and cost estimates, municipal permits and approvals, town entitlements, term sheets, promissory notes, unit reservation agreements, purchase and sale agreements, and developer track record materials; and (viii) financial statements, projections, models, return analyses including IRR and NPV scenarios, capital stack and equity structures, credit valuations, exit scenarios, and pricing data related to the Project or any other real estate development activities of the Disclosing Party.</p>

<p>If Proprietary Information is disclosed in tangible form it must be clearly labeled "Proprietary" or other similar term. If disclosed initially in any other form, Proprietary Information must be identified as such at the time of disclosure and confirmed in writing as proprietary within ten days of the disclosure. All drafts, revisions and final documents that comprise or include proposals, financial data, methodologies, technical data, diagrams, designs, models or strategic plans shall be deemed Proprietary Information without the requirement of marking. Strategic plans disclosed orally shall be deemed Proprietary Information without the requirement of reducing such information to writing. The terms of this agreement are specifically designated as Proprietary Information.</p>

<h3>Exceptions</h3>
<p>Proprietary Information does not include information that: (a) is or becomes available to the public without breach of this Agreement, (b) is lawfully obtained from a source that is not under an obligation of confidentiality to the disclosing party, (c) is in the possession of the receiving party in written or other recorded form at the time of disclosure, (d) is disclosed on a non-confidential basis to a third party by or with the permission of the disclosing party, (e) is developed by or on behalf of the receiving party by individuals who have not received Proprietary Information, or (f) is disclosed with the prior written consent of the disclosing party.</p>

<h3>Restrictions</h3>
<p>Each party agrees that, for a period of three (3) years from the date of disclosure, it will: (a) not use Proprietary Information of the other for purposes other than considering the desirability of, or carrying out, the business relationship under discussion, (b) not disclose Proprietary Information to any employees unless they have a reasonable need for such information and have been advised of the confidential nature of the information, (c) not disclose to any third party any Proprietary Information without the prior written consent of the disclosing party, and (d) maintain reasonably adequate procedures to ensure compliance. The receiving party will protect Proprietary Information with the same degree of care it uses for its own proprietary information, but in no event less than reasonable care.</p>

<p>Nothing in this Agreement shall prevent disclosure pursuant to a judicial or other lawful Governmental order, but only to the extent ordered, provided that the receiving party shall, unless prohibited by such order, notify the disclosing party in sufficient time to permit intervention.</p>

<h3>Remedies</h3>
<p>The parties agree that unauthorized disclosure of Proprietary Information shall cause material harm and that monetary damages may not be an adequate remedy. The disclosing party shall be entitled to seek injunctive or equitable relief in addition to any other remedies at law or in equity. In no event shall either party be liable to the other for any punitive, exemplary, special, indirect, incidental or consequential damages.</p>

<h3>Information Return</h3>
<p>All Proprietary Information will be returned promptly upon written request, or destroyed with written certification, except where storage on backup systems makes return or destruction infeasible, in which case confidentiality protections continue until destruction in the normal course of data retention.</p>

<h3>Intellectual Property Rights</h3>
<p>All rights in Proprietary Information, including patent, copyright, trade secret or similar intellectual property rights, are retained exclusively by the disclosing party. Nothing in this Agreement grants any license, title, interest, waiver or right to the receiving party.</p>

<h3>Term &amp; Survival</h3>
<p>This Agreement shall continue in effect for a period of two (2) years or until terminated. Either party may terminate at any time by written notice, effective the later of thirty days following receipt or any later date stated. The parties' obligations respecting non-disclosure and non-use shall survive termination for a period of three (3) years.</p>

<h3>Governing Law</h3>
<p>This Agreement will be governed by the laws of the State of Arizona without regard to its choice of law or conflicts of law provisions. The parties hereby waive any right to a trial by jury in any action arising out of or relating to this Agreement.</p>

<h3>Limitation of Liability</h3>
<p>IN NO EVENT SHALL EITHER PARTY BE LIABLE FOR CONSEQUENTIAL, SPECIAL, INDIRECT, INCIDENTAL, PUNITIVE OR EXEMPLARY DAMAGES, COSTS, EXPENSES OR LOSSES (INCLUDING LOST PROFITS AND OPPORTUNITY COSTS) RELATING TO THIS AGREEMENT.</p>

<h3>Equitable Relief</h3>
<p>In the event of breach, the disclosing party shall be entitled to seek interim, emergency and permanent restraints and injunctive relief without the need to post bond, as well as accounting and payment of any amounts received as a result of such breach.</p>

<h3>Entirety</h3>
<p>This Agreement constitutes the entire agreement between the parties covering disclosure of Proprietary Information and supersedes all previous communications. No modification shall be effective unless in writing and signed by both parties.</p>

<h3>Disclosing Party — Authorized Representative</h3>
<p>
  <strong>16740 E. Ave of the Fountains LLC</strong><br>
  Name: Kevin Simpson<br>
  Title: Co-Developer / Investor Relations<br>
  Address: 213 Debbie Ln, Corbin, KY 40701<br>
  Phone: (606) 304-0607<br>
  Email: Kevin@AKCapital.fund
</p>
`;

// Plain-text NDA content used to render the signed PDF
const NDA_SECTIONS = [
  { type: 'h1', text: 'Mutual Non-Disclosure Agreement' },
  { type: 'h2', text: '16740 E. Ave of the Fountains LLC and {{RECEIVING_NAME}}' },
  { type: 'p', text: 'This agreement is entered into between 16740 E. Ave of the Fountains LLC, an Arizona limited liability company, with a mailing address at 213 Debbie Ln, Corbin, KY 40701 ("Disclosing Party") and {{RECEIVING_NAME}} with an address {{RECEIVING_ADDRESS}} ("Receiving Party").' },

  { type: 'h3', text: 'Purpose' },
  { type: 'p', text: 'The parties plan to discuss a potential investment opportunity in connection with the real estate development project known as "The Avenue at Fountain Hills" (the "Project"). In the course of these discussions, it may become necessary for the parties to exchange proprietary or confidential information. The purpose of this Agreement is to protect the confidential nature of such information.' },

  { type: 'h3', text: 'Definition of Proprietary Information' },
  { type: 'p', text: 'Subject to the exceptions listed herein, the term "Proprietary Information" means information of a confidential nature disclosed during the term of this Agreement to the designated Authorized Representative identified herein. Proprietary Information includes but is not limited to (i) research and development; (ii) trade secrets; (iii) proprietary technical, marketing, operating, performance, cost, pricing, know-how, business and process information; (iv) communications plans, creative ideas, designs, client preferences and policies; (v) hardware, software, algorithms, computer processing systems, techniques, methodologies, formulae, processes, compilations of information, drawings, proposals, job notes, reports, records and specifications; (vi) information relating to 16740 E. Ave of the Fountains LLC, AK Capital Investments, their respective principals, members, managers, subsidiaries, affiliates, and partners, and the property located at or near 16740 E. Avenue of the Fountains, Fountain Hills, Arizona, including any related development entities and equity structures; (vii) project documentation, including property appraisals, architectural and engineering plans, build budgets and cost estimates, municipal permits and approvals, town entitlements, term sheets, promissory notes, unit reservation agreements, purchase and sale agreements, and developer track record materials; and (viii) financial statements, projections, models, return analyses including IRR and NPV scenarios, capital stack and equity structures, credit valuations, exit scenarios, and pricing data related to the Project or any other real estate development activities of the Disclosing Party.' },
  { type: 'p', text: 'If Proprietary Information is disclosed in tangible form it must be clearly labeled "Proprietary" or other similar term. If disclosed initially in any other form, Proprietary Information must be identified as such at the time of disclosure and confirmed in writing as proprietary within ten days of the disclosure. All drafts, revisions and final documents that comprise or include proposals, financial data, methodologies, technical data, diagrams, designs, models or strategic plans shall be deemed Proprietary Information without the requirement of marking. Strategic plans disclosed orally shall be deemed Proprietary Information without the requirement of reducing such information to writing. The terms of this agreement are specifically designated as Proprietary Information.' },

  { type: 'h3', text: 'Exceptions' },
  { type: 'p', text: 'Proprietary Information does not include information that: (a) is or becomes available to the public without breach of this Agreement, (b) is lawfully obtained from a source that is not under an obligation of confidentiality to the disclosing party, (c) is in the possession of the receiving party in written or other recorded form at the time of disclosure, (d) is disclosed on a non-confidential basis to a third party by or with the permission of the disclosing party, (e) is developed by or on behalf of the receiving party by individuals who have not received Proprietary Information, or (f) is disclosed with the prior written consent of the disclosing party.' },

  { type: 'h3', text: 'Restrictions' },
  { type: 'p', text: 'Each party agrees that, for a period of three (3) years from the date of disclosure, it will: (a) not use Proprietary Information of the other for purposes other than considering the desirability of, or carrying out, the business relationship under discussion, (b) not disclose Proprietary Information to any employees unless they have a reasonable need for such information and have been advised of the confidential nature of the information, (c) not disclose to any third party any Proprietary Information without the prior written consent of the disclosing party, and (d) maintain reasonably adequate procedures to ensure compliance. The receiving party will protect Proprietary Information with the same degree of care it uses for its own proprietary information, but in no event less than reasonable care.' },
  { type: 'p', text: 'Nothing in this Agreement shall prevent disclosure pursuant to a judicial or other lawful Governmental order, but only to the extent ordered, provided that the receiving party shall, unless prohibited by such order, notify the disclosing party in sufficient time to permit intervention.' },

  { type: 'h3', text: 'Remedies' },
  { type: 'p', text: 'The parties agree that unauthorized disclosure of Proprietary Information shall cause material harm and that monetary damages may not be an adequate remedy. The disclosing party shall be entitled to seek injunctive or equitable relief in addition to any other remedies at law or in equity. In no event shall either party be liable to the other for any punitive, exemplary, special, indirect, incidental or consequential damages.' },

  { type: 'h3', text: 'Information Return' },
  { type: 'p', text: 'All Proprietary Information will be returned promptly upon written request, or destroyed with written certification, except where storage on backup systems makes return or destruction infeasible, in which case confidentiality protections continue until destruction in the normal course of data retention.' },

  { type: 'h3', text: 'Intellectual Property Rights' },
  { type: 'p', text: 'All rights in Proprietary Information, including patent, copyright, trade secret or similar intellectual property rights, are retained exclusively by the disclosing party. Nothing in this Agreement grants any license, title, interest, waiver or right to the receiving party.' },

  { type: 'h3', text: 'Term & Survival' },
  { type: 'p', text: 'This Agreement shall continue in effect for a period of two (2) years or until terminated. Either party may terminate at any time by written notice, effective the later of thirty days following receipt or any later date stated. The parties\' obligations respecting non-disclosure and non-use shall survive termination for a period of three (3) years.' },

  { type: 'h3', text: 'Governing Law & Waiver of Jury Trial' },
  { type: 'p', text: 'This Agreement will be governed by the laws of the State of Arizona without regard to its choice of law or conflicts of law provisions. The parties hereby waive any right to a trial by jury in any action arising out of or relating to this Agreement.' },

  { type: 'h3', text: 'Limitation of Liability' },
  { type: 'p', text: 'IN NO EVENT SHALL EITHER PARTY BE LIABLE FOR CONSEQUENTIAL, SPECIAL, INDIRECT, INCIDENTAL, PUNITIVE OR EXEMPLARY DAMAGES, COSTS, EXPENSES OR LOSSES (INCLUDING LOST PROFITS AND OPPORTUNITY COSTS) RELATING TO THIS AGREEMENT.' },

  { type: 'h3', text: 'Equitable Relief' },
  { type: 'p', text: 'In the event of breach, the disclosing party shall be entitled to seek interim, emergency and permanent restraints and injunctive relief without the need to post bond, as well as accounting and payment of any amounts received as a result of such breach.' },

  { type: 'h3', text: 'Entirety' },
  { type: 'p', text: 'This Agreement constitutes the entire agreement between the parties covering disclosure of Proprietary Information and supersedes all previous communications. No modification shall be effective unless in writing and signed by both parties.' },
];

function fill(text, data) {
  return text
    .replace(/\{\{RECEIVING_NAME\}\}/g, data.name || '________________')
    .replace(/\{\{RECEIVING_ADDRESS\}\}/g, data.address || '________________');
}

export async function buildSignedNdaPdf(formData, meta) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`The Avenue NDA - ${formData.name}`);
  pdfDoc.setAuthor('16740 E. Ave of the Fountains LLC');
  pdfDoc.setSubject('Mutual Non-Disclosure Agreement');
  pdfDoc.setCreationDate(new Date());

  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const fontItalic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const pageW = 612, pageH = 792;
  const margin = 60;
  const maxWidth = pageW - 2 * margin;

  let page = pdfDoc.addPage([pageW, pageH]);
  let y = pageH - margin;

  function newPage() {
    page = pdfDoc.addPage([pageW, pageH]);
    y = pageH - margin;
  }

  function ensureSpace(needed) {
    if (y - needed < margin) newPage();
  }

  function widthOf(text, useFont, size) {
    return useFont.widthOfTextAtSize(text, size);
  }

  function wrap(text, useFont, size) {
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (widthOf(test, useFont, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawLines(lines, useFont, size, lineGap) {
    for (const line of lines) {
      ensureSpace(size + lineGap);
      page.drawText(line, { x: margin, y: y - size, size, font: useFont, color: rgb(0, 0, 0) });
      y -= (size + lineGap);
    }
  }

  // Render sections
  for (const section of NDA_SECTIONS) {
    const text = fill(section.text, formData);
    if (section.type === 'h1') {
      ensureSpace(40);
      const lines = wrap(text, fontBold, 18);
      drawLines(lines, fontBold, 18, 4);
      y -= 10;
    } else if (section.type === 'h2') {
      const lines = wrap(text, fontBold, 13);
      drawLines(lines, fontBold, 13, 3);
      y -= 12;
    } else if (section.type === 'h3') {
      ensureSpace(22);
      y -= 6;
      const lines = wrap(text, fontBold, 12);
      drawLines(lines, fontBold, 12, 3);
      y -= 4;
    } else {
      const lines = wrap(text, font, 10.5);
      drawLines(lines, font, 10.5, 3);
      y -= 8;
    }
  }

  // Signature block — keep on same page if possible
  ensureSpace(260);
  y -= 10;
  drawLines(['IN WITNESS WHEREOF, the parties have entered into this Agreement.'], font, 10.5, 3);
  y -= 16;

  // Receiving Party block
  drawLines(['Receiving Party:'], fontBold, 12, 3);
  y -= 4;
  const rpRows = [
    ['Name:', formData.name || ''],
    ['Title:', formData.title || ''],
    ['Entity / Firm:', formData.entity || '—'],
    ['Address:', formData.address || ''],
    ['Phone:', formData.phone || ''],
    ['Email:', formData.email || ''],
    ['Signature:', `/s/ ${formData.name || ''}  (typed signature accepted electronically)`],
    ['Date:', meta.dateLabel],
  ];
  for (const [label, value] of rpRows) {
    ensureSpace(14);
    page.drawText(label, { x: margin, y: y - 10, size: 10, font: fontBold });
    const wrapped = wrap(value || '—', font, 10);
    let lineY = y - 10;
    for (let i = 0; i < wrapped.length; i++) {
      if (i > 0) { lineY -= 12; ensureSpace(12); }
      page.drawText(wrapped[i], { x: margin + 90, y: lineY, size: 10, font });
    }
    y = lineY - 4;
  }

  y -= 14;
  ensureSpace(110);
  drawLines(['Disclosing Party:'], fontBold, 12, 3);
  y -= 4;
  const dpRows = [
    ['Entity:', '16740 E. Ave of the Fountains LLC'],
    ['By:', 'Kevin Simpson'],
    ['Title:', 'Co-Developer / Investor Relations'],
    ['Address:', '213 Debbie Ln, Corbin, KY 40701'],
    ['Email:', 'Kevin@AKCapital.fund'],
    ['Date:', meta.dateLabel],
  ];
  for (const [label, value] of dpRows) {
    ensureSpace(14);
    page.drawText(label, { x: margin, y: y - 10, size: 10, font: fontBold });
    page.drawText(value, { x: margin + 90, y: y - 10, size: 10, font });
    y -= 14;
  }

  // Audit footer
  y -= 18;
  ensureSpace(60);
  page.drawLine({ start: { x: margin, y }, end: { x: pageW - margin, y }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) });
  y -= 14;
  const auditLines = [
    `Electronic Signature Audit`,
    `Signed by typed signature: ${formData.name || ''}  <${formData.email || ''}>`,
    `Timestamp (UTC): ${meta.timestampIso}`,
    `IP Address: ${meta.ip}`,
    `User Agent: ${(meta.userAgent || '').slice(0, 110)}`,
    `Document hash: ${meta.docHash}`,
  ];
  for (const line of auditLines) {
    ensureSpace(11);
    page.drawText(line, { x: margin, y: y - 9, size: 9, font: fontItalic, color: rgb(0.3, 0.3, 0.3) });
    y -= 11;
  }

  return await pdfDoc.save();
}
