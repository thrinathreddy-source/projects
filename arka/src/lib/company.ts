/**
 * The operating company's details, in one place.
 *
 * These appear across the terms, privacy, refund and contact pages — the four
 * Razorpay checks before it will activate a live account. They used to be
 * twenty separate placeholders spread over four files, which invites filling in
 * two slightly different addresses and never noticing.
 *
 * Fill every field before launch. `npm run preflight` fails while any is empty,
 * and the pages render an obvious highlighted blank rather than a confident
 * looking gap, so an unfinished policy cannot ship looking finished.
 *
 * Nothing here is a secret, so it is committed rather than kept in the
 * environment: these are facts a customer is entitled to read.
 */

export type CompanyDetails = {
  /** Registered name of the entity, exactly as on the incorporation document. */
  legalName: string;
  registeredAddress: {
    street: string;
    /** Second address line, e.g. "Bengaluru, Karnataka 560001". */
    cityStatePin: string;
    /**
     * State of registration, spelled as in the GST registration.
     *
     * This is the place of supply for every intra-state sale, and it decides
     * whether an invoice carries CGST+SGST or IGST. Getting it wrong is a
     * filing problem, not a cosmetic one.
     */
    state: string;
  };
  /** City whose courts have jurisdiction, and which appears in the terms. */
  jurisdictionCity: string;
  email: {
    support: string;
    billing: string;
    privacy: string;
    abuse: string;
    legal: string;
  };
  /**
   * The Grievance Officer.
   *
   * Required by name — not by department — under the IT Rules 2021, which also
   * impose a 24-hour acknowledgement and 15-day resolution. The DPDP Act 2023
   * separately requires a published contact for data-principal requests. One
   * person can hold both roles at this size, and usually does.
   */
  grievanceOfficer: {
    name: string;
    email: string;
    /** e.g. "24 hours to acknowledge, 15 days to resolve". */
    responseSla: string;
  };
  tax: {
    /** 15-character GSTIN. Must appear on every invoice. */
    gstin: string;
    /**
     * SAC code for the service. 998434 ("on-line content downloads") is the
     * usual fit for this product; confirm with your CA before filing on it.
     */
    sacCode: string;
    /** GST rate as a percentage. 18 for digital services at time of writing. */
    gstRatePercent: number;
    /** Prefix for invoice numbers, e.g. "ARKA". Sequence is per financial year. */
    invoicePrefix: string;
  };
  /** How long server logs are kept, e.g. "90 days". */
  logRetention: string;
  /** Support turnaround quoted in the refund and contact pages, e.g. "2 working days". */
  supportResponseTime: string;
  /**
   * Liability floor in the terms: the greater of fees paid in the preceding
   * period or this. Have a lawyer set it — it is the number that decides what a
   * dispute costs. e.g. "₹5,000".
   */
  minimumLiability: string;
};

export const COMPANY: CompanyDetails = {
  legalName: "",
  registeredAddress: {
    street: "",
    cityStatePin: "",
    state: "",
  },
  jurisdictionCity: "",
  email: {
    support: "",
    billing: "",
    privacy: "",
    abuse: "",
    legal: "",
  },
  grievanceOfficer: {
    name: "",
    email: "",
    responseSla: "",
  },
  tax: {
    gstin: "",
    sacCode: "998434",
    gstRatePercent: 18,
    invoicePrefix: "ARKA",
  },
  logRetention: "",
  supportResponseTime: "",
  minimumLiability: "",
};

/**
 * The registered address on one line, for prose that cites it inline.
 *
 * Empty when either half is missing, so the placeholder still shows rather than
 * rendering half an address followed by a stray comma.
 */
export function registeredAddressLine(company: CompanyDetails = COMPANY): string {
  const { street, cityStatePin } = company.registeredAddress;
  if (!street.trim() || !cityStatePin.trim()) return "";
  return `${street}, ${cityStatePin}`;
}

/** Every unfilled field, as dotted paths. Empty means the policies are ready. */
export function missingCompanyDetails(company: CompanyDetails = COMPANY): string[] {
  const missing: string[] = [];

  const walk = (value: unknown, path: string) => {
    if (typeof value === "string") {
      if (value.trim() === "") missing.push(path);
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        walk(child, path ? `${path}.${key}` : key);
      }
    }
  };

  walk(company, "");
  return missing;
}
