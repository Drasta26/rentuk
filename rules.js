// UK letting compliance rules by nation. Data only, used by lib.js.
// Checked against official sources (GOV.UK, legislation.gov.uk, HSE, gov.wales, gov.scot/mygov.scot,
// nidirect.gov.uk, communities-ni.gov.uk) on 18 November 2026. Informational only, not legal advice.
// Re-check every rule before each release: letting law changes often.
//
// Fields: key (shared across nations where the same fact is recorded), label, kind ('date' = date of the last
// one, valid for `months`; 'yes' = done or not), legal (true = legal duty; false = good practice, not scored),
// canNA (the landlord may mark it not applicable, e.g. no gas supply), hint (one line), detail (plain English),
// url (official source).
(function (root) {
  'use strict';

  const VERIFIED = '18 November 2026';

  const GAS = {
    key: 'gas', label: 'Gas safety check', kind: 'date', months: 12, legal: true, canNA: true,
    hint: 'Gas Safe engineer every 12 months',
    detail: 'Every gas appliance and flue checked by a Gas Safe registered engineer every 12 months. Give the tenant a copy within 28 days of the check, and new tenants a copy before they move in. Keep records for at least 2 years. Mark it not applicable only if the property has no gas.'
  };
  const EPC = (minimum, url) => ({
    key: 'epc', label: 'Energy certificate (EPC)', kind: 'date', months: 120, legal: true, canNA: false, minimum,
    hint: minimum ? `Valid 10 years; rating ${minimum} or better to let` : 'Valid 10 years; no minimum rating to let',
    detail: minimum
      ? `A valid EPC (10 years) must be given to the tenant. The current minimum to let is band ${minimum}: F and G homes cannot be let unless an exemption is registered.`
      : 'A valid EPC (10 years) is needed when letting, and the rating must appear in adverts. There is no minimum rating to let at present.',
    url
  });
  const LEGIONELLA = (legal, detail, url, months) => ({
    key: 'legionella', label: 'Legionella risk assessed', kind: months ? 'date' : 'yes', months, legal, canNA: false,
    hint: legal ? 'Assess and control the risk from water systems' : 'Good practice: assess the risk from water systems',
    detail, url
  });
  const HMO = (detail, url) => ({
    key: 'licence', label: 'Licence (HMO or council scheme)', kind: 'yes', legal: true, canNA: true,
    hint: 'Only if your home or area needs one', detail, url
  });

  const NATION_RULES = {
    england: {
      items: [
        { ...GAS, url: 'https://www.hse.gov.uk/gas/landlords/gassaferecord.htm' },
        { key: 'eicr', label: 'Electrical safety (EICR)', kind: 'date', months: 60, legal: true, canNA: false,
          hint: 'Qualified inspector at least every 5 years',
          detail: 'Fixed electrics inspected and tested at least every 5 years, or sooner if the report says so. Copy to the tenant within 28 days, to new tenants before they move in, and to the council within 7 days if asked. Remedial work within 28 days.',
          url: 'https://www.legislation.gov.uk/uksi/2020/312/regulation/3' },
        EPC('E', 'https://www.gov.uk/guidance/domestic-private-rented-property-minimum-energy-efficiency-standard-landlord-guidance'),
        { key: 'deposit', label: 'Deposit protected', kind: 'yes', legal: true, canNA: true,
          hint: 'Approved scheme within 30 days, plus prescribed information',
          detail: 'Protect the deposit in a government-approved scheme and give the prescribed information within 30 days of receiving it. The cap is 5 weeks’ rent (6 weeks if annual rent is £50,000 or more). Mark it not applicable if you took no deposit.',
          url: 'https://www.gov.uk/deposit-protection-schemes-and-landlords' },
        { key: 'alarms', label: 'Smoke and CO alarms', kind: 'yes', legal: true, canNA: false,
          hint: 'Smoke alarm on every storey; CO alarm by fixed combustion appliances',
          detail: 'At least one smoke alarm on each storey used as living accommodation, and a carbon monoxide alarm in any room with a fixed combustion appliance (gas cookers excluded). Check they work on the first day of each tenancy and repair them when told they are faulty.',
          url: 'https://www.gov.uk/government/publications/smoke-and-carbon-monoxide-alarms-explanatory-booklet-for-landlords/the-smoke-and-carbon-monoxide-alarm-england-regulations-2015-qa-booklet-for-the-private-rented-sector-landlords-and-tenants' },
        { key: 'rightToRent', label: 'Right to Rent checked', kind: 'yes', legal: true, canNA: false,
          hint: 'Every adult, before the tenancy starts',
          detail: 'Check every adult who will live there has the right to rent in England, before the tenancy starts. Follow-up checks are needed for time-limited permission. This applies in England only.',
          url: 'https://www.gov.uk/check-tenant-right-to-rent-documents' },
        { key: 'rraInfo', label: 'Written terms or Information Sheet', kind: 'yes', legal: true, canNA: false,
          hint: 'Renters’ Rights Act: written terms for new tenancies',
          detail: 'From 1 May 2026, new tenancies need written information on the terms before the tenancy starts. Existing written tenancies needed the government’s Renters’ Rights Act Information Sheet by 31 May 2026. All private tenancies are now periodic and section 21 is abolished.',
          url: 'https://www.gov.uk/government/publications/the-renters-rights-act-information-sheet-2026' },
        HMO('A mandatory HMO licence is needed for 5 or more people forming 2 or more households. Your council may also run additional HMO or selective licensing for your area. Check with the council; mark it not applicable if no licence is needed.',
          'https://www.gov.uk/house-in-multiple-occupation-licence'),
        LEGIONELLA(true, 'Landlords must assess and control the risk of legionella from water systems. A formal written assessment is not always required, but keeping a record is good practice.',
          'https://www.hse.gov.uk/legionnaires/things-to-consider.htm')
      ],
      upcoming: [
        'Register your rental property (landlord database): opens 15 December 2026, region by region, starting in the West Midlands. Every region must be registered by 14 November 2027. Fee £65 per property per year.',
        'Landlord ombudsman: membership expected to become mandatory in 2028. Not yet in force.',
        'Minimum EPC rating C by 1 October 2030: confirmed government policy, not yet law.',
        'Awaab’s Law (damp and mould timescales) for private rentals: under consultation until 18 December 2026; no start date.',
        'Decent Homes Standard for private rentals: planned for 2035.'
      ]
    },
    wales: {
      items: [
        { ...GAS, url: 'https://www.gov.wales/renting-homes-checklist-landlords-and-tenants-html' },
        { key: 'eicr', label: 'Electrical Condition Report', kind: 'date', months: 60, legal: true, canNA: false,
          hint: 'At least every 5 years; copy within 14 days',
          detail: 'A valid Electrical Condition Report is needed for each period of occupation, renewed at least every 5 years. Give the contract-holder a copy within 14 days. Without one, the home is treated as unfit for human habitation.',
          url: 'https://www.gov.wales/fitness-homes-human-habitation-guidance-landlords-html' },
        EPC('E', 'https://www.gov.uk/guidance/domestic-private-rented-property-minimum-energy-efficiency-standard-landlord-guidance'),
        { key: 'deposit', label: 'Deposit protected', kind: 'yes', legal: true, canNA: true,
          hint: 'Approved scheme within 30 days, plus required information',
          detail: 'Protect the deposit in an approved scheme and give the required information within 30 days of payment. A holding deposit is capped at 1 week’s rent. Mark it not applicable if you took no deposit.',
          url: 'https://www.gov.wales/renting-homes-checklist-landlords-and-tenants-html' },
        { key: 'alarms', label: 'Smoke and CO alarms', kind: 'yes', legal: true, canNA: false,
          hint: 'Mains-wired, interlinked smoke alarm on every storey; CO alarms',
          detail: 'A working, mains-wired smoke alarm on every storey, interlinked with the other mains alarms, and a carbon monoxide alarm in every room with a gas, oil or solid-fuel appliance. Keep them in working order.',
          url: 'https://www.gov.wales/fitness-homes-human-habitation-guidance-landlords-html' },
        { key: 'rentSmart', label: 'Rent Smart Wales registration', kind: 'date', months: 60, legal: true, canNA: false,
          hint: 'Register (and licence, unless an agent manages it); renew every 5 years',
          detail: 'Every landlord with a let property in Wales must register with Rent Smart Wales, renewed every 5 years. Anyone doing letting or management work also needs a licence, unless a licensed agent does all of it. Enter the date you last registered or renewed.',
          url: 'https://rentsmart.gov.wales/en/landlord/landlord-registration/' },
        { key: 'writtenStatement', label: 'Written statement of contract', kind: 'yes', legal: true, canNA: false,
          hint: 'Within 14 days of the occupation date, with the landlord information notice',
          detail: 'Give the contract-holder a written statement of the occupation contract within 14 days of the occupation date, plus the landlord information notice (RHW2).',
          url: 'https://www.gov.wales/renting-homes-checklist-landlords-and-tenants-html' },
        HMO('HMO licensing applies under the Housing Act 2004, and councils may add additional licensing. Check with your council; mark it not applicable if no licence is needed.',
          'https://www.gov.wales/houses-multiple-occupation-hmo-licensing'),
        LEGIONELLA(true, 'Landlords must assess and control the risk of legionella from water systems. Keeping a record of the assessment is good practice.',
          'https://www.hse.gov.uk/legionnaires/')
      ],
      upcoming: [
        'Minimum EPC rating C by 2030: proposed for England and Wales; whether Wales adopts the same date is not confirmed.'
      ]
    },
    scotland: {
      items: [
        { ...GAS, url: 'https://www.gov.scot/publications/repairing-standard-statutory-guidance-private-landlords/' },
        { key: 'eicr', label: 'Electrical safety (EICR + PAT)', kind: 'date', months: 60, legal: true, canNA: false,
          hint: 'Fixed wiring and your appliances, at most every 5 years',
          detail: 'An electrical installation report (EICR) and appliance testing (PAT) for appliances you provide, before the first let and then at most every 5 years. Give the tenant a copy before the tenancy starts. Keep the EICR for 6 years.',
          url: 'https://www.gov.scot/publications/repairing-standard-statutory-guidance-private-landlords/pages/16/' },
        EPC(null, 'https://www.mygov.scot/landlord-registration'),
        { key: 'deposit', label: 'Deposit lodged', kind: 'yes', legal: true, canNA: true,
          hint: 'Approved scheme within 30 working days; cap 2 months’ rent',
          detail: 'Lodge the deposit with an approved scheme within 30 working days of the tenancy starting, and give the required information. The cap is 2 months’ rent. Mark it not applicable if you took no deposit.',
          url: 'https://www.mygov.scot/tenancy-deposits-landlords' },
        { key: 'alarms', label: 'Fire and CO alarms', kind: 'yes', legal: true, canNA: false,
          hint: 'Interlinked smoke and kitchen heat alarms; CO alarms',
          detail: 'Ceiling-mounted, interlinked alarms: smoke alarms in the main living room and every hallway and landing, and a heat alarm in the kitchen. A carbon monoxide alarm in every room with a fixed combustion appliance or flue.',
          url: 'https://www.gov.scot/publications/fire-safety-guidance-private-rented-properties/' },
        { key: 'landlordReg', label: 'Scottish Landlord Register', kind: 'date', months: 36, legal: true, canNA: false,
          hint: 'Register before letting; renew every 3 years',
          detail: 'Register with the council before letting and renew every 3 years. Adverts must show your registration number. Enter the date you last registered or renewed.',
          url: 'https://www.mygov.scot/landlord-registration' },
        { key: 'prtTerms', label: 'Tenancy terms and notes given', kind: 'yes', legal: true, canNA: false,
          hint: 'Written terms and supporting notes by the end of day one',
          detail: 'Give the written terms of the private residential tenancy, with the Easy Read Notes or Statutory Terms Supporting Notes, by the end of the day the tenancy starts.',
          url: 'https://www.gov.scot/publications/private-residential-tenancy-statutory-terms-supporting-notes-2/pages/6/' },
        HMO('An HMO licence is needed when 3 or more unrelated people share. Check with your council; mark it not applicable if no licence is needed.',
          'https://www.mygov.scot/landlord-registration'),
        LEGIONELLA(true, 'Take reasonable steps to reduce the risk of legionella: assess before the first let and review at least every 2 years (government guidance).',
          'https://www.mygov.scot/landlord-repairs', 24)
      ],
      upcoming: [
        'Rent control areas: the framework is in force since 1 April 2026, but no area has been designated yet.',
        'From 1 April 2027: a rent officer or tribunal cannot set rent above the increase the landlord proposed.',
        'Minimum energy standard for private rentals: proposed, not yet law.'
      ]
    },
    ni: {
      items: [
        { ...GAS, detail: 'Every gas appliance and flue checked by a Gas Safe registered engineer every 12 months. Give the tenant a copy within 28 days of the check. Mark it not applicable only if the property has no gas.',
          url: 'https://www.nidirect.gov.uk/articles/health-and-safety-rented-accommodation' },
        { key: 'eicr', label: 'Electrical safety (EICR)', kind: 'date', months: 60, legal: true, canNA: false,
          hint: 'At least every 5 years; required for all tenancies',
          detail: 'Fixed electrics inspected and tested at least every 5 years. Copy to the tenant within 28 days, to new tenants before they move in, and to the council within 7 days if asked. Required for new tenancies from 1 April 2025 and all tenancies from 1 December 2025.',
          url: 'https://www.communities-ni.gov.uk/articles/electrical-safety-standards-private-tenancies-regulations-northern-ireland-2024' },
        EPC(null, 'https://www.communities-ni.gov.uk/articles/private-tenancies-act-northern-ireland-2022'),
        { key: 'deposit', label: 'Deposit protected', kind: 'yes', legal: true, canNA: true,
          hint: 'Within 28 days; information within 35 days; cap 1 month’s rent',
          detail: 'Protect the deposit within 28 days of receiving it and give the scheme information within 35 days. The cap is 1 month’s rent. Mark it not applicable if you took no deposit.',
          url: 'https://www.nidirect.gov.uk/articles/tenancy-deposit-scheme-information-landlords' },
        { key: 'alarms', label: 'Smoke, heat and CO alarms', kind: 'yes', legal: true, canNA: false,
          hint: 'Interlinked smoke and kitchen heat alarms; CO alarms',
          detail: 'A smoke alarm in the main living room and every circulation space on each storey, and a heat alarm in every kitchen, all interlinked. A carbon monoxide alarm in any room with a fixed combustion appliance or flue. Alarms must work at the start of each tenancy.',
          url: 'https://www.legislation.gov.uk/nisr/2024/123' },
        { key: 'landlordReg', label: 'NI Landlord Registration', kind: 'date', months: 36, legal: true, canNA: false,
          hint: 'Register before letting; valid 3 years',
          detail: 'Register with the Landlord Registration Scheme before letting; registration lasts 3 years. Enter the date you last registered or renewed.',
          url: 'https://www.nidirect.gov.uk/articles/landlord-registration-scheme' },
        { key: 'tin', label: 'Tenancy Information Notice', kind: 'yes', legal: true, canNA: false,
          hint: 'Within 28 days of the tenancy starting',
          detail: 'Give the tenant a free Tenancy Information Notice within 28 days of the tenancy starting, and a Notice of Variation within 28 days of any change.',
          url: 'https://www.nidirect.gov.uk/articles/private-rent-and-tenancies' },
        HMO('HMO licensing applies under the Houses in Multiple Occupation Act (NI) 2016. Check with your council; mark it not applicable if no licence is needed.',
          'https://www.legislation.gov.uk/nia/2016/24/contents'),
        LEGIONELLA(false, 'Good practice: assess the risk of legionella from water systems. RentUK could not confirm a specific legal duty for Northern Ireland landlords, so this is not counted in your score.',
          'https://www.hseni.gov.uk/')
      ],
      upcoming: [
        'Energy efficiency rules for private tenancies: in progress, no date set.',
        'Notice-to-quit periods: official sources currently differ; check nidirect before serving any notice.'
      ]
    }
  };

  const RentUKRules = { VERIFIED, NATION_RULES };
  if (typeof module !== 'undefined' && module.exports) module.exports = RentUKRules;
  else root.RentUKRules = RentUKRules;
})(typeof window !== 'undefined' ? window : globalThis);
