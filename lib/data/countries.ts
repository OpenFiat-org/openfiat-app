/**
 * Global country & currency registry.
 *
 * Covers all ISO 3166-1 countries and territories plus partially-recognized
 * states and non-ISO territories with their own currencies in actual use
 * (e.g. Transnistrian ruble PRB, Somaliland shilling SLSH, Zimbabwe Gold ZWG).
 * `isRecognized: false` marks non-UN-member states and dependent territories —
 * they are never hidden from the UI. Flag emojis are derived from the ISO code
 * (regional indicators), with overrides for territories without their own flag.
 */

export interface Country {
  /** ISO 3166-1 alpha-2 code, or a stable pseudo-code (X*) for non-ISO territories. */
  code: string;
  name: string;
  /** Lowercase URL-safe slug, unique (e.g. "kenya", "palestine"). */
  slug: string;
  /** Flag emoji — every entry has one. */
  flag: string;
  currencyCode: string;
  currencyName: string;
  currencySymbol: string;
  isRecognized: boolean;
}

function flagEmoji(code: string): string {
  return String.fromCodePoint(
    ...code
      .toUpperCase()
      .split("")
      .map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65),
  );
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// [code, name, currencyCode, currencyName, currencySymbol, recognized?, flagCode?]
type Raw = [string, string, string, string, string, boolean?, string?];

const RAW: Raw[] = [
  // ── Africa ──
  ["DZ", "Algeria", "DZD", "Algerian dinar", "د.ج"],
  ["AO", "Angola", "AOA", "Angolan kwanza", "Kz"],
  ["BJ", "Benin", "XOF", "West African CFA franc", "CFA"],
  ["BW", "Botswana", "BWP", "Botswana pula", "P"],
  ["BF", "Burkina Faso", "XOF", "West African CFA franc", "CFA"],
  ["BI", "Burundi", "BIF", "Burundian franc", "FBu"],
  ["CV", "Cabo Verde", "CVE", "Cape Verdean escudo", "$"],
  ["CM", "Cameroon", "XAF", "Central African CFA franc", "FCFA"],
  ["CF", "Central African Republic", "XAF", "Central African CFA franc", "FCFA"],
  ["TD", "Chad", "XAF", "Central African CFA franc", "FCFA"],
  ["KM", "Comoros", "KMF", "Comorian franc", "CF"],
  ["CD", "Congo (DRC)", "CDF", "Congolese franc", "FC"],
  ["CG", "Congo (Republic)", "XAF", "Central African CFA franc", "FCFA"],
  ["CI", "Côte d'Ivoire", "XOF", "West African CFA franc", "CFA"],
  ["DJ", "Djibouti", "DJF", "Djiboutian franc", "Fdj"],
  ["EG", "Egypt", "EGP", "Egyptian pound", "E£"],
  ["GQ", "Equatorial Guinea", "XAF", "Central African CFA franc", "FCFA"],
  ["ER", "Eritrea", "ERN", "Eritrean nakfa", "Nfk"],
  ["SZ", "Eswatini", "SZL", "Swazi lilangeni", "E"],
  ["ET", "Ethiopia", "ETB", "Ethiopian birr", "Br"],
  ["GA", "Gabon", "XAF", "Central African CFA franc", "FCFA"],
  ["GM", "Gambia", "GMD", "Gambian dalasi", "D"],
  ["GH", "Ghana", "GHS", "Ghanaian cedi", "GH₵"],
  ["GN", "Guinea", "GNF", "Guinean franc", "FG"],
  ["GW", "Guinea-Bissau", "XOF", "West African CFA franc", "CFA"],
  ["KE", "Kenya", "KES", "Kenyan shilling", "KSh"],
  ["LS", "Lesotho", "LSL", "Lesotho loti", "L"],
  ["LR", "Liberia", "LRD", "Liberian dollar", "L$"],
  ["LY", "Libya", "LYD", "Libyan dinar", "ل.د"],
  ["MG", "Madagascar", "MGA", "Malagasy ariary", "Ar"],
  ["MW", "Malawi", "MWK", "Malawian kwacha", "MK"],
  ["ML", "Mali", "XOF", "West African CFA franc", "CFA"],
  ["MR", "Mauritania", "MRU", "Mauritanian ouguiya", "UM"],
  ["MU", "Mauritius", "MUR", "Mauritian rupee", "₨"],
  ["MA", "Morocco", "MAD", "Moroccan dirham", "د.م."],
  ["MZ", "Mozambique", "MZN", "Mozambican metical", "MT"],
  ["NA", "Namibia", "NAD", "Namibian dollar", "N$"],
  ["NE", "Niger", "XOF", "West African CFA franc", "CFA"],
  ["NG", "Nigeria", "NGN", "Nigerian naira", "₦"],
  ["RW", "Rwanda", "RWF", "Rwandan franc", "FRw"],
  ["ST", "São Tomé & Príncipe", "STN", "São Tomé and Príncipe dobra", "Db"],
  ["SN", "Senegal", "XOF", "West African CFA franc", "CFA"],
  ["SC", "Seychelles", "SCR", "Seychellois rupee", "₨"],
  ["SL", "Sierra Leone", "SLE", "Sierra Leonean leone", "Le"],
  ["SO", "Somalia", "SOS", "Somali shilling", "Sh"],
  ["ZA", "South Africa", "ZAR", "South African rand", "R"],
  ["SS", "South Sudan", "SSP", "South Sudanese pound", "£"],
  ["SD", "Sudan", "SDG", "Sudanese pound", "ج.س."],
  ["TZ", "Tanzania", "TZS", "Tanzanian shilling", "TSh"],
  ["TG", "Togo", "XOF", "West African CFA franc", "CFA"],
  ["TN", "Tunisia", "TND", "Tunisian dinar", "د.ت"],
  ["UG", "Uganda", "UGX", "Ugandan shilling", "USh"],
  ["ZM", "Zambia", "ZMW", "Zambian kwacha", "K"],
  ["ZW", "Zimbabwe", "ZWG", "Zimbabwe Gold (ZiG)", "ZiG"],
  // Africa — territories & partially recognized
  ["EH", "Western Sahara", "MAD", "Moroccan dirham", "د.م.", false],
  ["XS", "Somaliland", "SLSH", "Somaliland shilling", "SlSh", false, "SO"],
  ["SH", "Saint Helena", "SHP", "Saint Helena pound", "£", false],
  ["RE", "Réunion", "EUR", "Euro", "€", false],
  ["YT", "Mayotte", "EUR", "Euro", "€", false],

  // ── Asia ──
  ["AF", "Afghanistan", "AFN", "Afghan afghani", "؋"],
  ["AM", "Armenia", "AMD", "Armenian dram", "֏"],
  ["AZ", "Azerbaijan", "AZN", "Azerbaijani manat", "₼"],
  ["BH", "Bahrain", "BHD", "Bahraini dinar", ".د.ب"],
  ["BD", "Bangladesh", "BDT", "Bangladeshi taka", "৳"],
  ["BT", "Bhutan", "BTN", "Bhutanese ngultrum", "Nu."],
  ["BN", "Brunei", "BND", "Brunei dollar", "B$"],
  ["KH", "Cambodia", "KHR", "Cambodian riel", "៛"],
  ["CN", "China", "CNY", "Chinese yuan (renminbi)", "¥"],
  ["CY", "Cyprus", "EUR", "Euro", "€"],
  ["GE", "Georgia", "GEL", "Georgian lari", "₾"],
  ["IN", "India", "INR", "Indian rupee", "₹"],
  ["ID", "Indonesia", "IDR", "Indonesian rupiah", "Rp"],
  ["IR", "Iran", "IRR", "Iranian rial", "﷼"],
  ["IQ", "Iraq", "IQD", "Iraqi dinar", "ع.د"],
  ["IL", "Israel", "ILS", "Israeli new shekel", "₪"],
  ["JP", "Japan", "JPY", "Japanese yen", "¥"],
  ["JO", "Jordan", "JOD", "Jordanian dinar", "د.ا"],
  ["KZ", "Kazakhstan", "KZT", "Kazakhstani tenge", "₸"],
  ["KW", "Kuwait", "KWD", "Kuwaiti dinar", "د.ك"],
  ["KG", "Kyrgyzstan", "KGS", "Kyrgyz som", "с"],
  ["LA", "Laos", "LAK", "Lao kip", "₭"],
  ["LB", "Lebanon", "LBP", "Lebanese pound", "ل.ل"],
  ["MY", "Malaysia", "MYR", "Malaysian ringgit", "RM"],
  ["MV", "Maldives", "MVR", "Maldivian rufiyaa", "Rf"],
  ["MN", "Mongolia", "MNT", "Mongolian tögrög", "₮"],
  ["MM", "Myanmar", "MMK", "Myanmar kyat", "K"],
  ["NP", "Nepal", "NPR", "Nepalese rupee", "₨"],
  ["KP", "North Korea", "KPW", "North Korean won", "₩"],
  ["OM", "Oman", "OMR", "Omani rial", "ر.ع."],
  ["PK", "Pakistan", "PKR", "Pakistani rupee", "₨"],
  ["PH", "Philippines", "PHP", "Philippine peso", "₱"],
  ["QA", "Qatar", "QAR", "Qatari riyal", "ر.ق"],
  ["SA", "Saudi Arabia", "SAR", "Saudi riyal", "ر.س"],
  ["SG", "Singapore", "SGD", "Singapore dollar", "S$"],
  ["KR", "South Korea", "KRW", "South Korean won", "₩"],
  ["LK", "Sri Lanka", "LKR", "Sri Lankan rupee", "Rs"],
  ["SY", "Syria", "SYP", "Syrian pound", "£S"],
  ["TJ", "Tajikistan", "TJS", "Tajikistani somoni", "ЅМ"],
  ["TH", "Thailand", "THB", "Thai baht", "฿"],
  ["TL", "Timor-Leste", "USD", "United States dollar", "$"],
  ["TR", "Turkey", "TRY", "Turkish lira", "₺"],
  ["TM", "Turkmenistan", "TMT", "Turkmenistani manat", "m"],
  ["AE", "United Arab Emirates", "AED", "UAE dirham", "د.إ"],
  ["UZ", "Uzbekistan", "UZS", "Uzbekistani so'm", "soʻm"],
  ["VN", "Vietnam", "VND", "Vietnamese đồng", "₫"],
  ["YE", "Yemen", "YER", "Yemeni rial", "﷼"],
  // Asia — territories & partially recognized
  ["PS", "Palestine", "ILS", "Israeli new shekel (JOD also used)", "₪", false],
  // Grouped here with Hong Kong and Macau: `isRecognized: false` records
  // non-UN-membership and nothing more, and the UI never hides these entries
  // or labels them differently. The column heading is "Country / Territory".
  ["TW", "Taiwan", "TWD", "New Taiwan dollar", "NT$", false],
  ["HK", "Hong Kong", "HKD", "Hong Kong dollar", "HK$", false],
  ["MO", "Macau", "MOP", "Macanese pataca", "MOP$", false],
  ["XNC", "Northern Cyprus", "TRY", "Turkish lira", "₺", false, "TR"],
  ["IO", "British Indian Ocean Territory", "USD", "United States dollar", "$", false],
  ["CC", "Cocos (Keeling) Islands", "AUD", "Australian dollar", "$", false],
  ["CX", "Christmas Island", "AUD", "Australian dollar", "$", false],

  // ── Europe ──
  ["AL", "Albania", "ALL", "Albanian lek", "L"],
  ["AD", "Andorra", "EUR", "Euro", "€"],
  ["AT", "Austria", "EUR", "Euro", "€"],
  ["BY", "Belarus", "BYN", "Belarusian ruble", "Br"],
  ["BE", "Belgium", "EUR", "Euro", "€"],
  ["BA", "Bosnia & Herzegovina", "BAM", "Bosnia and Herzegovina convertible mark", "KM"],
  ["BG", "Bulgaria", "BGN", "Bulgarian lev", "лв"],
  ["HR", "Croatia", "EUR", "Euro", "€"],
  ["CZ", "Czechia", "CZK", "Czech koruna", "Kč"],
  ["DK", "Denmark", "DKK", "Danish krone", "kr"],
  ["EE", "Estonia", "EUR", "Euro", "€"],
  ["FI", "Finland", "EUR", "Euro", "€"],
  ["FR", "France", "EUR", "Euro", "€"],
  ["DE", "Germany", "EUR", "Euro", "€"],
  ["GR", "Greece", "EUR", "Euro", "€"],
  ["HU", "Hungary", "HUF", "Hungarian forint", "Ft"],
  ["IS", "Iceland", "ISK", "Icelandic króna", "kr"],
  ["IE", "Ireland", "EUR", "Euro", "€"],
  ["IT", "Italy", "EUR", "Euro", "€"],
  ["LV", "Latvia", "EUR", "Euro", "€"],
  ["LI", "Liechtenstein", "CHF", "Swiss franc", "CHF"],
  ["LT", "Lithuania", "EUR", "Euro", "€"],
  ["LU", "Luxembourg", "EUR", "Euro", "€"],
  ["MT", "Malta", "EUR", "Euro", "€"],
  ["MD", "Moldova", "MDL", "Moldovan leu", "L"],
  ["MC", "Monaco", "EUR", "Euro", "€"],
  ["ME", "Montenegro", "EUR", "Euro", "€"],
  ["NL", "Netherlands", "EUR", "Euro", "€"],
  ["MK", "North Macedonia", "MKD", "Macedonian denar", "ден"],
  ["NO", "Norway", "NOK", "Norwegian krone", "kr"],
  ["PL", "Poland", "PLN", "Polish złoty", "zł"],
  ["PT", "Portugal", "EUR", "Euro", "€"],
  ["RO", "Romania", "RON", "Romanian leu", "lei"],
  ["RU", "Russia", "RUB", "Russian ruble", "₽"],
  ["SM", "San Marino", "EUR", "Euro", "€"],
  ["RS", "Serbia", "RSD", "Serbian dinar", "din"],
  ["SK", "Slovakia", "EUR", "Euro", "€"],
  ["SI", "Slovenia", "EUR", "Euro", "€"],
  ["ES", "Spain", "EUR", "Euro", "€"],
  ["SE", "Sweden", "SEK", "Swedish krona", "kr"],
  ["CH", "Switzerland", "CHF", "Swiss franc", "CHF"],
  ["UA", "Ukraine", "UAH", "Ukrainian hryvnia", "₴"],
  ["GB", "United Kingdom", "GBP", "Pound sterling", "£"],
  // Europe — territories & partially recognized
  ["VA", "Vatican City", "EUR", "Euro", "€", false],
  ["XK", "Kosovo", "EUR", "Euro", "€", false],
  ["XTR", "Transnistria", "PRB", "Transnistrian ruble", "р.", false, "MD"],
  ["AX", "Åland Islands", "EUR", "Euro", "€", false],
  ["FO", "Faroe Islands", "DKK", "Danish krone (Faroese króna)", "kr", false],
  ["GI", "Gibraltar", "GIP", "Gibraltar pound", "£", false],
  ["GG", "Guernsey", "GGP", "Guernsey pound", "£", false],
  ["JE", "Jersey", "JEP", "Jersey pound", "£", false],
  ["IM", "Isle of Man", "IMP", "Manx pound", "£", false],
  ["SJ", "Svalbard & Jan Mayen", "NOK", "Norwegian krone", "kr", false],

  // ── North America & Caribbean ──
  ["US", "United States", "USD", "United States dollar", "$"],
  ["CA", "Canada", "CAD", "Canadian dollar", "$"],
  ["MX", "Mexico", "MXN", "Mexican peso", "$"],
  ["BZ", "Belize", "BZD", "Belize dollar", "BZ$"],
  ["CR", "Costa Rica", "CRC", "Costa Rican colón", "₡"],
  ["SV", "El Salvador", "USD", "United States dollar", "$"],
  ["GT", "Guatemala", "GTQ", "Guatemalan quetzal", "Q"],
  ["HN", "Honduras", "HNL", "Honduran lempira", "L"],
  ["NI", "Nicaragua", "NIO", "Nicaraguan córdoba", "C$"],
  ["PA", "Panama", "PAB", "Panamanian balboa (USD also used)", "B/."],
  ["CU", "Cuba", "CUP", "Cuban peso", "₱"],
  ["DO", "Dominican Republic", "DOP", "Dominican peso", "RD$"],
  ["HT", "Haiti", "HTG", "Haitian gourde", "G"],
  ["JM", "Jamaica", "JMD", "Jamaican dollar", "J$"],
  ["TT", "Trinidad & Tobago", "TTD", "Trinidad and Tobago dollar", "TT$"],
  ["BB", "Barbados", "BBD", "Barbadian dollar", "Bds$"],
  ["BS", "Bahamas", "BSD", "Bahamian dollar", "B$"],
  ["AG", "Antigua & Barbuda", "XCD", "East Caribbean dollar", "EC$"],
  ["DM", "Dominica", "XCD", "East Caribbean dollar", "EC$"],
  ["GD", "Grenada", "XCD", "East Caribbean dollar", "EC$"],
  ["KN", "Saint Kitts & Nevis", "XCD", "East Caribbean dollar", "EC$"],
  ["LC", "Saint Lucia", "XCD", "East Caribbean dollar", "EC$"],
  ["VC", "Saint Vincent & the Grenadines", "XCD", "East Caribbean dollar", "EC$"],
  // North America — territories
  ["AI", "Anguilla", "XCD", "East Caribbean dollar", "EC$", false],
  ["AW", "Aruba", "AWG", "Aruban florin", "ƒ", false],
  ["BM", "Bermuda", "BMD", "Bermudian dollar", "$", false],
  ["BQ", "Caribbean Netherlands", "USD", "United States dollar", "$", false],
  ["VG", "British Virgin Islands", "USD", "United States dollar", "$", false],
  ["KY", "Cayman Islands", "KYD", "Cayman Islands dollar", "CI$", false],
  ["CW", "Curaçao", "ANG", "Netherlands Antillean guilder", "ƒ", false],
  ["GL", "Greenland", "DKK", "Danish krone", "kr", false],
  ["GP", "Guadeloupe", "EUR", "Euro", "€", false],
  ["MQ", "Martinique", "EUR", "Euro", "€", false],
  ["MS", "Montserrat", "XCD", "East Caribbean dollar", "EC$", false],
  ["PR", "Puerto Rico", "USD", "United States dollar", "$", false],
  ["BL", "Saint Barthélemy", "EUR", "Euro", "€", false],
  ["MF", "Saint Martin", "EUR", "Euro", "€", false],
  ["PM", "Saint Pierre & Miquelon", "EUR", "Euro", "€", false],
  ["SX", "Sint Maarten", "ANG", "Netherlands Antillean guilder", "ƒ", false],
  ["TC", "Turks & Caicos Islands", "USD", "United States dollar", "$", false],
  ["VI", "U.S. Virgin Islands", "USD", "United States dollar", "$", false],

  // ── South America ──
  ["AR", "Argentina", "ARS", "Argentine peso", "$"],
  ["BO", "Bolivia", "BOB", "Bolivian boliviano", "Bs"],
  ["BR", "Brazil", "BRL", "Brazilian real", "R$"],
  ["CL", "Chile", "CLP", "Chilean peso", "$"],
  ["CO", "Colombia", "COP", "Colombian peso", "$"],
  ["EC", "Ecuador", "USD", "United States dollar", "$"],
  ["GY", "Guyana", "GYD", "Guyanese dollar", "G$"],
  ["PY", "Paraguay", "PYG", "Paraguayan guaraní", "₲"],
  ["PE", "Peru", "PEN", "Peruvian sol", "S/"],
  ["SR", "Suriname", "SRD", "Surinamese dollar", "$"],
  ["UY", "Uruguay", "UYU", "Uruguayan peso", "$U"],
  ["VE", "Venezuela", "VES", "Venezuelan bolívar soberano", "Bs.S"],
  // South America — territories
  ["FK", "Falkland Islands", "FKP", "Falkland Islands pound", "£", false],
  ["GF", "French Guiana", "EUR", "Euro", "€", false],
  ["GS", "South Georgia & South Sandwich Islands", "GBP", "Pound sterling", "£", false],

  // ── Oceania ──
  ["AU", "Australia", "AUD", "Australian dollar", "$"],
  ["FJ", "Fiji", "FJD", "Fijian dollar", "FJ$"],
  ["KI", "Kiribati", "AUD", "Australian dollar", "$"],
  ["MH", "Marshall Islands", "USD", "United States dollar", "$"],
  ["FM", "Micronesia", "USD", "United States dollar", "$"],
  ["NR", "Nauru", "AUD", "Australian dollar", "$"],
  ["NZ", "New Zealand", "NZD", "New Zealand dollar", "$"],
  ["PW", "Palau", "USD", "United States dollar", "$"],
  ["PG", "Papua New Guinea", "PGK", "Papua New Guinean kina", "K"],
  ["WS", "Samoa", "WST", "Samoan tālā", "T"],
  ["SB", "Solomon Islands", "SBD", "Solomon Islands dollar", "SI$"],
  ["TO", "Tonga", "TOP", "Tongan paʻanga", "T$"],
  ["TV", "Tuvalu", "AUD", "Australian dollar", "$"],
  ["VU", "Vanuatu", "VUV", "Vanuatu vatu", "VT"],
  // Oceania — territories
  ["AS", "American Samoa", "USD", "United States dollar", "$", false],
  ["CK", "Cook Islands", "NZD", "New Zealand dollar (Cook Islands dollar also used)", "$", false],
  ["PF", "French Polynesia", "XPF", "CFP franc", "₣", false],
  ["GU", "Guam", "USD", "United States dollar", "$", false],
  ["NC", "New Caledonia", "XPF", "CFP franc", "₣", false],
  ["NU", "Niue", "NZD", "New Zealand dollar", "$", false],
  ["NF", "Norfolk Island", "AUD", "Australian dollar", "$", false],
  ["MP", "Northern Mariana Islands", "USD", "United States dollar", "$", false],
  ["PN", "Pitcairn Islands", "NZD", "New Zealand dollar", "$", false],
  ["TK", "Tokelau", "NZD", "New Zealand dollar", "$", false],
  ["WF", "Wallis & Futuna", "XPF", "CFP franc", "₣", false],
  ["UM", "U.S. Minor Outlying Islands", "USD", "United States dollar", "$", false],

  // ── Other territories ──
  ["TF", "French Southern Territories", "EUR", "Euro", "€", false],
  ["AQ", "Antarctica", "USD", "United States dollar (no local currency)", "$", false],
  ["BV", "Bouvet Island", "NOK", "Norwegian krone", "kr", false],
  ["HM", "Heard & McDonald Islands", "AUD", "Australian dollar", "$", false],
];

export const COUNTRIES: Country[] = RAW.map(
  ([code, name, currencyCode, currencyName, currencySymbol, recognized = true, flagCode]) => ({
    code,
    name,
    slug: slugify(name),
    flag: flagEmoji(flagCode ?? code),
    currencyCode,
    currencyName,
    currencySymbol,
    isRecognized: recognized,
  }),
);

export const COUNTRIES_BY_SLUG: ReadonlyMap<string, Country> = new Map(
  COUNTRIES.map((c) => [c.slug, c]),
);

const COUNTRIES_BY_CODE: ReadonlyMap<string, Country> = new Map(
  COUNTRIES.map((c) => [c.code, c]),
);

/** Lookup by ISO (or pseudo) country code. */
export function getCountry(code: string): Country | undefined {
  return COUNTRIES_BY_CODE.get(code.toUpperCase());
}

/** All countries/territories using a given currency code. */
export function countriesByCurrency(currencyCode: string): Country[] {
  const code = currencyCode.toUpperCase();
  return COUNTRIES.filter((c) => c.currencyCode === code);
}

/** Case-insensitive search across name, country code, slug, and currency fields. */
export function searchCountries(query: string): Country[] {
  const q = query.trim().toLowerCase();
  if (!q) return COUNTRIES;
  return COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase() === q ||
      c.slug.includes(q) ||
      c.currencyCode.toLowerCase().includes(q) ||
      c.currencyName.toLowerCase().includes(q),
  );
}

/** Flag overrides for shared/supranational currencies (EU flag emoji exists). */
const CURRENCY_FLAG: Record<string, string> = {
  EUR: flagEmoji("EU"),
  USD: flagEmoji("US"),
  GBP: flagEmoji("GB"),
  XOF: flagEmoji("SN"),
  XAF: flagEmoji("CM"),
  XCD: flagEmoji("AG"),
  XPF: flagEmoji("PF"),
  AUD: flagEmoji("AU"),
  NZD: flagEmoji("NZ"),
};

/** Representative flag emoji for a currency code. */
export function flagForCurrency(currencyCode: string): string {
  const code = currencyCode.toUpperCase();
  if (CURRENCY_FLAG[code]) return CURRENCY_FLAG[code];
  const users = countriesByCurrency(code);
  return (users.find((c) => c.isRecognized) ?? users[0])?.flag ?? "🏳️";
}

/** Currencies with the deepest simulated liquidity, listed first in pickers. */
export const POPULAR_CURRENCY_CODES = [
  "KES", "NGN", "USD", "EUR", "GBP", "INR", "BRL", "ZAR", "PHP", "IDR",
] as const;
