import { describe, expect, it } from "vitest";
import {
  NO_CONTACT_METHOD_WARNING,
  buildImportRows,
  countRowsWithoutContactMethod,
  guessImportMappings
} from "@/lib/contact-import-mapping";
import { parseCsvText } from "@/lib/contact-file-parser";

const dateTypes = [
  { id: "birthday", name: "Birthday", slug: "birthday", isSystem: true, isActive: true },
  { id: "anniversary", name: "Anniversary", slug: "anniversary", isSystem: true, isActive: true }
];
const customFields = [{ id: "policy", name: "Policy Number", key: "policy_number" }];

const GOOGLE_CLASSIC_HEADERS = [
  "Name", "Given Name", "Additional Name", "Family Name", "Yomi Name", "Given Name Yomi", "Additional Name Yomi", "Family Name Yomi",
  "Name Prefix", "Name Suffix", "Initials", "Nickname", "Short Name", "Maiden Name", "Birthday", "Gender", "Location", "Billing Information",
  "Directory Server", "Mileage", "Occupation", "Hobby", "Sensitivity", "Priority", "Subject", "Notes", "Language", "Photo", "Group Membership",
  "E-mail 1 - Type", "E-mail 1 - Value", "E-mail 2 - Type", "E-mail 2 - Value", "Phone 1 - Type", "Phone 1 - Value", "Phone 2 - Type", "Phone 2 - Value",
  "Address 1 - Type", "Address 1 - Formatted", "Address 1 - Street", "Address 1 - City", "Address 1 - PO Box", "Address 1 - Region",
  "Address 1 - Postal Code", "Address 1 - Country", "Address 1 - Extended Address", "Organization 1 - Type", "Organization 1 - Name",
  "Organization 1 - Yomi Name", "Organization 1 - Title", "Organization 1 - Department", "Organization 1 - Symbol", "Organization 1 - Location",
  "Organization 1 - Job Description", "Website 1 - Type", "Website 1 - Value", "Event 1 - Type", "Event 1 - Value", "Relation 1 - Type",
  "Relation 1 - Value", "Custom Field 1 - Type", "Custom Field 1 - Value"
];

const GOOGLE_2023_HEADERS = [
  "First Name", "Middle Name", "Last Name", "Phonetic First Name", "Phonetic Middle Name", "Phonetic Last Name", "Name Prefix", "Name Suffix",
  "Nickname", "File As", "Organization Name", "Organization Title", "Organization Department", "Birthday", "Notes", "Photo", "Labels",
  "E-mail 1 - Label", "E-mail 1 - Value", "E-mail 2 - Label", "E-mail 2 - Value", "Phone 1 - Label", "Phone 1 - Value", "Phone 2 - Label", "Phone 2 - Value",
  "Address 1 - Label", "Address 1 - Formatted", "Address 1 - Street", "Address 1 - City", "Address 1 - PO Box", "Address 1 - Region",
  "Address 1 - Postal Code", "Address 1 - Country", "Address 1 - Extended Address", "Website 1 - Label", "Website 1 - Value",
  "Event 1 - Label", "Event 1 - Value", "Relation 1 - Label", "Relation 1 - Value", "Custom Field 1 - Label", "Custom Field 1 - Value"
];

const OUTLOOK_HEADERS = [
  "First Name", "Middle Name", "Last Name", "Title", "Suffix", "Nickname", "Given Yomi", "Surname Yomi", "E-mail Address", "E-mail 2 Address",
  "E-mail 3 Address", "Home Phone", "Home Phone 2", "Business Phone", "Business Phone 2", "Mobile Phone", "Car Phone", "Other Phone",
  "Primary Phone", "Pager", "Business Fax", "Home Fax", "Other Fax", "Company Main Phone", "Callback", "Radio Phone", "Telex", "TTY/TDD Phone",
  "IMAddress", "Job Title", "Department", "Company", "Office Location", "Manager's Name", "Assistant's Name", "Assistant's Phone", "Referred By",
  "CEO's Name", "Business Street", "Business City", "Business State", "Business Postal Code", "Business Country/Region", "Home Street", "Home City",
  "Home State", "Home Postal Code", "Home Country/Region", "Other Street", "Other City", "Other State", "Other Postal Code", "Other Country/Region",
  "Personal Web Page", "Spouse", "Schools", "Hobby", "Location", "Web Page", "Birthday", "Anniversary", "Notes"
];

/** Headers the mapper recognised before the 2026-09-24 widening; each must keep its target. */
const MAPPED_TODAY: Record<string, string> = {
  "First Name": "field:firstName", "first_name": "field:firstName", "First": "field:firstName", "Given Name": "field:firstName",
  "Last Name": "field:lastName", "Surname": "field:lastName", "Family Name": "field:lastName", "Last": "field:lastName",
  "Name": "field:displayName", "Full Name": "field:displayName", "Display Name": "field:displayName", "Contact Name": "field:displayName",
  "Company": "field:company", "Company Name": "field:company", "Organization": "field:company", "Organisation": "field:company",
  "Employer": "field:company", "Organization Name": "field:company",
  "Email": "field:email", "E-mail": "field:email", "Email Address": "field:email", "Email 1": "field:email", "Email 2": "field:email", "E-mail 2": "field:email",
  "Phone": "field:phone", "Mobile": "field:phone", "Cell": "field:phone", "Telephone": "field:phone", "Tel": "field:phone",
  "Phone Number": "field:phone", "Mobile Number": "field:phone", "Phone 1": "field:phone", "Phone 2": "field:phone",
  "Address": "field:address", "Address 1": "field:address", "Mailing Address": "field:address",
  "Street Address": "field:street1", "Address Line 1": "field:street1", "Street 1": "field:street1",
  "Address Line 2": "field:street2", "Suite": "field:street2", "Unit": "field:street2", "Street 2": "field:street2",
  "City": "field:city", "Locality": "field:city", "State": "field:state", "Province": "field:state", "Region": "field:state",
  "ZIP": "field:postalCode", "Zip Code": "field:postalCode", "Postal Code": "field:postalCode", "Country": "field:country",
  "Notes": "field:publicNotes", "Note": "field:publicNotes", "Comments": "field:publicNotes", "Public Notes": "field:publicNotes", "Context": "field:publicNotes",
  "Policy Number": "custom:policy",
  "Birthday": "date-id:birthday:YEARLY", "Date of Birth": "date-id:birthday:YEARLY", "Anniversary": "date-id:anniversary:YEARLY",
  "Home Warranty Date": "date-new:Home%20Warranty:NONE", "Closing Date": "date-new:Closing:NONE", "Renewal Date": "date-new:Renewal:NONE",
  "Follow Up Date": "date-new:Follow%20Up:NONE", "Event 1 - Value": "date-new:Event%201%20Value:NONE",
  "Photo": "ignore", "Nickname": "ignore", "Website": "ignore", "Labels": "ignore", "Group Membership": "ignore", "Middle Name": "ignore",
  "Job Title": "ignore", "Department": "ignore"
};

function mapped(headers: string[], fields = customFields) {
  return guessImportMappings(headers, dateTypes, fields);
}

describe("guessImportMappings keeps today's headers", () => {
  it("maps every header recognised before the widening to the same target", () => {
    const headers = Object.keys(MAPPED_TODAY);
    expect(mapped(headers)).toEqual(MAPPED_TODAY);
  });
});

describe("guessImportMappings reads common exports", () => {
  it("maps a classic Google Contacts export and never treats a Type column as a value", () => {
    const mapping = mapped(GOOGLE_CLASSIC_HEADERS);
    expect(mapping).toMatchObject({
      "Name": "field:displayName", "Given Name": "field:firstName", "Family Name": "field:lastName", "Additional Name": "ignore",
      "Birthday": "date-id:birthday:YEARLY", "Notes": "field:publicNotes",
      "E-mail 1 - Type": "ignore", "E-mail 1 - Value": "field:email", "E-mail 2 - Type": "ignore", "E-mail 2 - Value": "field:email",
      "Phone 1 - Type": "ignore", "Phone 1 - Value": "field:phone", "Phone 2 - Type": "ignore", "Phone 2 - Value": "field:phone",
      "Address 1 - Type": "ignore", "Organization 1 - Type": "ignore", "Organization 1 - Name": "field:company",
      "Website 1 - Type": "ignore", "Website 1 - Value": "ignore", "Event 1 - Type": "ignore", "Event 1 - Value": "date-new:Event%201%20Value:NONE",
      "Relation 1 - Type": "ignore", "Relation 1 - Value": "ignore", "Custom Field 1 - Type": "ignore", "Custom Field 1 - Value": "ignore",
      "Group Membership": "ignore", "Photo": "ignore", "Nickname": "ignore"
    });
  });

  it("maps a 2023 Google Contacts export and never treats a Label column as a value", () => {
    const mapping = mapped(GOOGLE_2023_HEADERS);
    expect(mapping).toMatchObject({
      "First Name": "field:firstName", "Middle Name": "ignore", "Last Name": "field:lastName",
      "Phonetic First Name": "ignore", "Phonetic Middle Name": "ignore", "Phonetic Last Name": "ignore", "File As": "ignore",
      "Organization Name": "field:company", "Birthday": "date-id:birthday:YEARLY", "Notes": "field:publicNotes", "Labels": "ignore",
      "E-mail 1 - Label": "ignore", "E-mail 1 - Value": "field:email", "E-mail 2 - Label": "ignore", "E-mail 2 - Value": "field:email",
      "Phone 1 - Label": "ignore", "Phone 1 - Value": "field:phone", "Phone 2 - Label": "ignore", "Phone 2 - Value": "field:phone",
      "Address 1 - Label": "ignore", "Website 1 - Label": "ignore", "Website 1 - Value": "ignore",
      "Event 1 - Label": "ignore", "Event 1 - Value": "date-new:Event%201%20Value:NONE", "Custom Field 1 - Label": "ignore", "Custom Field 1 - Value": "ignore"
    });
  });

  it("maps an Outlook export, leaving fax, pager and switchboard columns alone", () => {
    const mapping = mapped(OUTLOOK_HEADERS);
    expect(mapping).toMatchObject({
      "First Name": "field:firstName", "Last Name": "field:lastName", "Surname Yomi": "ignore", "Given Yomi": "ignore",
      "E-mail Address": "field:email", "E-mail 2 Address": "field:email", "E-mail 3 Address": "field:email",
      "Home Phone": "field:phone", "Home Phone 2": "field:phone", "Business Phone": "field:phone", "Business Phone 2": "field:phone",
      "Mobile Phone": "field:phone", "Other Phone": "field:phone", "Primary Phone": "field:phone",
      "Car Phone": "ignore", "Pager": "ignore", "Business Fax": "ignore", "Home Fax": "ignore", "Other Fax": "ignore",
      "Company Main Phone": "ignore", "Callback": "ignore", "Radio Phone": "ignore", "Telex": "ignore", "TTY/TDD Phone": "ignore",
      "Assistant's Phone": "ignore", "IMAddress": "ignore", "Company": "field:company", "Job Title": "ignore", "Department": "ignore",
      "Business Postal Code": "field:postalCode", "Birthday": "date-id:birthday:YEARLY", "Anniversary": "date-id:anniversary:YEARLY", "Notes": "field:publicNotes"
    });
  });

  it("maps hand-made spreadsheet headers", () => {
    expect(mapped(["Cell Phone", "Work Phone", "Work Email", "Primary Email", "Home E-mail", "Telephone", "Tel", "Fax", "Pager", "Phone (Mobile)"])).toEqual({
      "Cell Phone": "field:phone", "Work Phone": "field:phone", "Work Email": "field:email", "Primary Email": "field:email", "Home E-mail": "field:email",
      "Telephone": "field:phone", "Tel": "field:phone", "Fax": "ignore", "Pager": "ignore", "Phone (Mobile)": "ignore"
    });
  });

  it("only ignores a Type or Label column when it labels a sibling value column", () => {
    const propertyType = [{ id: "property_type", name: "Property Type", key: "property_type" }];
    expect(mapped(["Property Type", "Property Value"], propertyType)).toMatchObject({ "Property Type": "custom:property_type" });
    expect(mapped(["Roof Type", "Phone Type", "Phone"])).toEqual({ "Roof Type": "ignore", "Phone Type": "ignore", "Phone": "field:phone" });
  });
});

describe("buildImportRows with export files", () => {
  it("splits Google's ::: multi-values and reads the sibling Type column as the label", () => {
    const parsed = parseCsvText([
      "Name,E-mail 1 - Type,E-mail 1 - Value,Phone 1 - Type,Phone 1 - Value",
      "Jordan Lee,* Home,jordan@example.com ::: jordan.lee@work.example,* Mobile,(555) 234-5678 ::: +1 555 234 5679"
    ].join("\n"), "google.csv");
    const [row] = buildImportRows(parsed, mapped(parsed.headers));
    expect(row.errors).toEqual([]);
    expect(row.record.emails.map((item) => item.value)).toEqual(["jordan@example.com", "jordan.lee@work.example"]);
    expect(row.record.emails.map((item) => item.label)).toEqual(["Home", "Home"]);
    expect(row.record.phones.map((item) => item.value)).toEqual(["(555) 234-5678", "+1 555 234 5679"]);
    expect(row.record.phones[0]).toMatchObject({ label: "Mobile", isPrimary: true });
  });

  it("uses the qualifier of an Outlook-style header as the label", () => {
    const parsed = parseCsvText([
      "First Name,Last Name,Mobile Phone,Business Phone,Home Phone 2,E-mail Address",
      "Sam,Rivera,(555) 234-5678,(555) 234-5600,(555) 234-5601,sam@example.com"
    ].join("\n"), "outlook.csv");
    const [row] = buildImportRows(parsed, mapped(parsed.headers));
    expect(row.errors).toEqual([]);
    expect(row.record.phones.map((item) => [item.value, item.label])).toEqual([["(555) 234-5678", "Mobile"], ["(555) 234-5600", "Business"], ["(555) 234-5601", "Home"]]);
    expect(row.record.emails[0]).toEqual({ value: "sam@example.com", label: null, isPrimary: true });
  });

  it("keeps a plain Email column label-free and still splits on pipes, commas and newlines", () => {
    const parsed = parseCsvText(["Name,Email,Phone", 'Casey Kim,"a@example.com, b@example.com","555-234-5678|555-234-5679"'].join("\n"), "plain.csv");
    const [row] = buildImportRows(parsed, mapped(parsed.headers));
    expect(row.record.emails.map((item) => item.value)).toEqual(["a@example.com", "b@example.com"]);
    expect(row.record.emails[0]?.label).toBeNull();
    expect(row.record.phones.map((item) => item.value)).toEqual(["555-234-5678", "555-234-5679"]);
  });

  it("counts the rows that have no phone or email from the row warnings", () => {
    const parsed = parseCsvText(["First Name,Last Name,Cell Phone", "Missing,One,", "Missing,Two,", "Reachable,Person,(555) 234-5678"].join("\n"), "people.csv");
    const rows = buildImportRows(parsed, mapped(parsed.headers));
    expect(rows.map((row) => row.warnings)).toEqual([[NO_CONTACT_METHOD_WARNING], [NO_CONTACT_METHOD_WARNING], []]);
    expect(countRowsWithoutContactMethod(rows)).toBe(2);
    expect(countRowsWithoutContactMethod([])).toBe(0);
  });
});
