import { createDbClient } from "./client";

/**
 * Populates realistic sample records inside every module (RFIs, Submittals,
 * Change Orders, Punch List, Commitments/Budget, Documents, Drawings,
 * Meetings, Correspondence, Inspections, Safety, T&M Tickets, Transmittals,
 * Direct Costs, Billing, Prequalification, Bidding, Estimating, Lookahead,
 * Schedule, Photos, Prime Contract) for the two projects `seed.ts` already
 * created. Run this AFTER `seed.ts` -- it looks up the companies, users,
 * projects, cost codes, spec sections, and trades that script created by
 * name/email rather than creating them again.
 *
 * Every "attachment" here points at a placeholder storage key with no real
 * file behind it -- good enough to browse titles/lists/detail pages, but
 * "download" on any of these will 404 until real files are uploaded.
 */

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const { queryClient: sql } = createDbClient(connectionString);

  const [building] = await sql`select id from projects where name = 'Amman Heights Residential Tower'`;
  const [infra] = await sql`select id from projects where name = 'Zarqa Wastewater Pipeline Expansion'`;
  if (!building || !infra) throw new Error("seed.ts projects not found -- run pnpm --filter @siteops/db seed first");
  const buildingId = building.id as string;
  const infraId = infra.id as string;

  const userRows = await sql`select id, email from users`;
  const userByEmail = new Map<string, string>(userRows.map((u) => [u.email as string, u.id as string]));
  const uid = (email: string): string => {
    const id = userByEmail.get(email);
    if (!id) throw new Error(`seed.ts user not found: ${email}`);
    return id;
  };
  const sara = uid("sara.haddad@siteops.test");
  const omar = uid("omar.nassar@siteops.test");
  const lina = uid("lina.kanaan@siteops.test");
  const khalid = uid("khalid.zoubi@siteops.test");
  const yousef = uid("yousef.amer@siteops.test");
  const rana = uid("rana.odeh@siteops.test");
  const fadi = uid("fadi.salameh@siteops.test");
  const huda = uid("huda.masri@siteops.test");
  const ziad = uid("ziad.btoush@siteops.test");
  const nadia = uid("nadia.qutub@siteops.test");
  const karim = uid("karim.abughazaleh@siteops.test");

  const companyRows = await sql`select id, name from companies`;
  const companyByName = new Map<string, string>(companyRows.map((c) => [c.name as string, c.id as string]));
  const cid = (name: string): string => {
    const id = companyByName.get(name);
    if (!id) throw new Error(`seed.ts company not found: ${name}`);
    return id;
  };
  const gc = cid("Al-Amal General Contracting");
  const sub1 = cid("Rawafed Electrical Works");
  const sub2 = cid("Structura Concrete Co.");
  const consultant = cid("Amman Engineering Consultants");
  const owner = cid("Petra Development Holdings");

  const costCodeRows = await sql`select id, code from cost_codes where project_id = ${buildingId}`;
  const costCodeByCode = new Map<string, string>(costCodeRows.map((c) => [c.code as string, c.id as string]));
  const cc = (code: string): string => {
    const id = costCodeByCode.get(code);
    if (!id) throw new Error(`seed.ts cost code not found: ${code}`);
    return id;
  };

  const specRows = await sql`select id, csi_code from specifications_sections where project_id = ${buildingId}`;
  const specByCode = new Map<string, string>(specRows.map((s) => [s.csi_code as string, s.id as string]));
  const spec = (code: string): string => {
    const id = specByCode.get(code);
    if (!id) throw new Error(`seed.ts spec section not found: ${code}`);
    return id;
  };

  console.warn("Creating placeholder attachments for documents/drawings/photos...");
  const [buildingAttachment] = await sql`
    insert into attachments (owner_type, owner_id, project_id, storage_key, filename, mime, size, uploaded_by)
    values ('demo_placeholder', ${buildingId}, ${buildingId}, 'demo/placeholder.pdf', 'placeholder.pdf', 'application/pdf', 1024, ${sara})
    returning id
  `;
  if (!buildingAttachment) throw new Error("attachment insert failed");
  const attachmentId = buildingAttachment.id as string;

  console.warn("Seeding RFIs...");
  const rfiData: [string, string, string, string, string, string | null][] = [
    ["RFI-001", "Concrete mix design for foundation walls", "Which mix design applies to the basement retaining walls -- the standard 4000psi mix or the sulfate-resistant mix called out in the geotech report?", "answered", lina, sub2],
    ["RFI-002", "Electrical panel schedule conflict", "Panel schedule on E-401 shows a 225A main but the one-line diagram shows 400A. Which governs?", "open", omar, sub1],
    ["RFI-003", "Rebar cover at slab edge", "Drawings show 2in cover at the slab edge but ACI 318 table suggests 1.5in is sufficient for this exposure class. Please confirm.", "open", lina, sub2],
    ["RFI-004", "Waterproofing membrane at Level 1 podium", "Detail 7/A-501 doesn't show the termination point for the podium waterproofing membrane against the parapet.", "answered", khalid, null],
    ["RFI-005", "Door hardware finish", "Spec section calls for satin chrome but the finish schedule shows brushed nickel for the same door type. Which is correct?", "draft", omar, null],
    ["RFI-006", "HVAC duct routing above corridor ceiling", "Structural beam at grid line 4 conflicts with the main supply duct routing shown on M-201.", "closed", lina, sub1],
    ["RFI-007", "Curtain wall anchor embed depth", "Embed plate detail references a 6in depth but the structural drawings show 4.5in slab thickness at that location.", "open", khalid, null],
    ["RFI-008", "Fire-rated assembly at shaft wall", "Please confirm the UL assembly number for the elevator shaft wall -- spec references U419 but drawing note says U411.", "answered", omar, null],
  ];
  for (const [number, subject, question, status, ballInCourt, ballInCourtCompany] of rfiData) {
    await sql`
      insert into rfis (project_id, number, subject, question, status, ball_in_court_user_id, ball_in_court_company_id, due_date, created_by)
      values (${buildingId}, ${number}, ${subject}, ${question}, ${status}, ${ballInCourt}, ${ballInCourtCompany}, now() + interval '7 days', ${sara})
    `;
  }
  await sql`
    insert into rfis (project_id, number, subject, question, status, ball_in_court_user_id, created_by)
    values
      (${infraId}, 'RFI-001', 'Pipe bedding material for rock excavation zones', 'Where rock excavation is encountered, does the bedding spec change from sand to crushed stone?', 'open', ${rana}, ${sara}),
      (${infraId}, 'RFI-002', 'Manhole frame elevation at Station 4+50', 'Proposed grade shown on civil drawings differs from the manhole rim elevation on the utility plan by 4 inches.', 'answered', ${nadia}, ${sara})
  `;

  console.warn("Seeding Submittals...");
  const submittalData: [string, string, string, string, string, string][] = [
    ["SUB-001", spec("03.30.00"), "Ready-Mix Concrete Mix Designs", "in_review", "shop_drawings", sub2],
    ["SUB-002", spec("03.30.00"), "Reinforcing Steel Shop Drawings", "approved", "shop_drawings", sub2],
    ["SUB-003", spec("26.00.00"), "Distribution Panel Product Data", "revise_resubmit", "product_data", sub1],
    ["SUB-004", spec("26.00.00"), "Lighting Fixture Samples", "draft", "samples", sub1],
    ["SUB-005", spec("03.30.00"), "Concrete Curing Compound Certificates", "approved_as_noted", "certificates", sub2],
    ["SUB-006", spec("26.00.00"), "Generator Manufacturer Field Report", "closed", "manufacturer_field_reports", sub1],
  ];
  for (const [number, specSectionId, title, status, submittalType, respCompany] of submittalData) {
    await sql`
      insert into submittals (project_id, number, spec_section_id, title, status, submittal_type, ball_in_court_user_id, responsible_contractor_company_id, due_date, created_by)
      values (${buildingId}, ${number}, ${specSectionId}, ${title}, ${status}, ${submittalType}, ${lina}, ${respCompany}, now() + interval '14 days', ${sara})
    `;
  }

  console.warn("Seeding Change Orders...");
  const coData: [string, string, string, string, string, string][] = [
    ["CO-001", "Additional excavation for unforeseen rock", "9800", "approved", "unforeseen_condition", "prime"],
    ["CO-002", "Upgrade electrical panel per RFI-002 resolution", "14500", "pending_approval", "rfi", "prime"],
    ["CO-003", "Owner-requested lobby finish upgrade", "22000", "draft", "owner_change", "prime"],
    ["CO-004", "Value engineering credit -- alternate roofing membrane", "-8200", "approved", "value_engineering", "prime"],
    ["CO-005", "Design development change -- relocate mechanical room", "5400", "rejected", "design_development", "prime"],
  ];
  for (const [number, title, costImpact, status, reason, targetType] of coData) {
    await sql`
      insert into change_orders (project_id, number, target_type, target_id, cost_impact, status, reason, title, created_by)
      values (${buildingId}, ${number}, ${targetType}, ${buildingId}, ${costImpact}, ${status}, ${reason}, ${title}, ${sara})
    `;
  }

  console.warn("Seeding Punch List items...");
  const [locationRow] = await sql`select id from locations where project_id = ${buildingId} and level_type = 'zone' limit 1`;
  const punchData: [string, string, string, string, string, string | null][] = [
    ["PL-001", "Touch-up paint required at Level 3 corridor wall", "low", "closed", yousef, null],
    ["PL-002", "Missing outlet cover plates in Unit 402", "medium", "open", yousef, sub1],
    ["PL-003", "Door closer not adjusted -- slams shut, Level 2 stairwell", "medium", "ready_for_review", yousef, null],
    ["PL-004", "Caulking gap at window sill, Unit 501", "low", "approved", yousef, null],
    ["PL-005", "Cracked floor tile at lobby entrance", "high", "open", khalid, sub2],
    ["PL-006", "HVAC diffuser installed crooked in Unit 210", "low", "closed", yousef, null],
    ["PL-007", "Fire extinguisher cabinet missing signage", "medium", "open", fadi, null],
    ["PL-008", "Handrail loose at Level 4 exterior stair", "high", "in_dispute", khalid, sub2],
    ["PL-009", "Paint overspray on window glazing, Unit 305", "low", "ready_for_review", yousef, null],
    ["PL-010", "Electrical panel labeling incomplete", "medium", "open", omar, sub1],
  ];
  for (const [number, description, priority, status, assignee, assigneeCompany] of punchData) {
    await sql`
      insert into punch_items (project_id, number, description, location_id, assignee_user_id, assignee_company_id, priority, status, due_date, created_by)
      values (${buildingId}, ${number}, ${description}, ${locationRow?.id ?? null}, ${assignee}, ${assigneeCompany}, ${priority}, ${status}, now() + interval '10 days', ${sara})
    `;
  }
  await sql`
    insert into punch_items (project_id, number, description, priority, status, assignee_user_id, created_by)
    values
      (${infraId}, 'PL-001', 'Backfill compaction test failed at Station 2+00, re-compact and re-test', 'high', 'open', ${rana}, ${sara}),
      (${infraId}, 'PL-002', 'Manhole cover missing bolt', 'medium', 'closed', ${uid("mahmoud.tarawneh@siteops.test")}, ${sara})
  `;

  console.warn("Seeding Commitments + line items...");
  const commitmentData: [string, string, string, string, string][] = [
    ["SC-001", "Rawafed Electrical Works -- Electrical Subcontract", "subcontract", sub1, "26-000"],
    ["SC-002", "Structura Concrete Co. -- Concrete Subcontract", "subcontract", sub2, "03-300"],
    ["PO-001", "Painting and Coating Purchase Order", "po", sub2, "09-900"],
  ];
  for (const [number, title, type, companyId, costCode] of commitmentData) {
    const [commitment] = await sql`
      insert into commitments (project_id, company_id, type, cost_code_id, number, title, created_by)
      values (${buildingId}, ${companyId}, ${type}, ${cc(costCode)}, ${number}, ${title}, ${sara})
      returning id
    `;
    if (!commitment) continue;
    await sql`
      insert into commitment_line_items (commitment_id, cost_code_id, schedule_of_values_amount, description)
      values (${commitment.id}, ${cc(costCode)}, ${type === "subcontract" ? "185000" : "42000"}, ${"Base scope -- " + title})
    `;
  }

  console.warn("Seeding Budget line items...");
  const budgetData: [string, string, string][] = [
    ["03-300", "620000", "18000"],
    ["07-200", "95000", "0"],
    ["09-900", "48000", "-3000"],
    ["26-000", "410000", "14500"],
  ];
  for (const [code, original, approvedChanges] of budgetData) {
    await sql`
      insert into budget_line_items (project_id, cost_code_id, original_amount, approved_changes_amount, projected_amount, created_by)
      values (${buildingId}, ${cc(code)}, ${original}, ${approvedChanges}, ${Number(original) + Number(approvedChanges)}, ${sara})
    `;
  }

  console.warn("Seeding Prime Contract...");
  await sql`
    insert into prime_contracts (project_id, contract_number, title, owner_company_id, original_contract_sum, status, executed_date, created_by)
    values (${buildingId}, 'PC-2024-001', 'Amman Heights Residential Tower -- GC Agreement', ${owner}, '4850000', 'executed', now() - interval '180 days', ${sara})
  `;

  console.warn("Seeding Documents + folders...");
  const [specsFolder] = await sql`insert into document_folders (project_id, name) values (${buildingId}, 'Specifications') returning id`;
  const [permitsFolder] = await sql`insert into document_folders (project_id, name) values (${buildingId}, 'Permits') returning id`;
  const docTitles = [
    ["Project Manual - Division 03 Concrete", specsFolder?.id ?? null],
    ["Project Manual - Division 26 Electrical", specsFolder?.id ?? null],
    ["Building Permit", permitsFolder?.id ?? null],
    ["Fire Department Approval Letter", permitsFolder?.id ?? null],
    ["Geotechnical Report", null],
    ["Site Logistics Plan", null],
  ] as const;
  for (const [title, folderId] of docTitles) {
    await sql`
      insert into documents (project_id, folder_id, title, current_attachment_id, created_by)
      values (${buildingId}, ${folderId}, ${title}, ${attachmentId}, ${sara})
    `;
  }

  console.warn("Seeding Drawings + revisions...");
  const drawingData: [string, string, string][] = [
    ["A-101", "Architectural", "Level 1 Floor Plan"],
    ["A-501", "Architectural", "Wall Sections and Details"],
    ["S-201", "Structural", "Foundation Plan"],
    ["E-401", "Electrical", "Panel Schedules"],
    ["M-201", "Mechanical", "Level 2 HVAC Plan"],
  ];
  for (const [sheetNumber, discipline, title] of drawingData) {
    const [drawing] = await sql`
      insert into drawings (project_id, sheet_number, discipline, title, created_by)
      values (${buildingId}, ${sheetNumber}, ${discipline}, ${title}, ${sara})
      returning id
    `;
    if (!drawing) continue;
    const [revision] = await sql`
      insert into drawing_revisions (drawing_id, revision_code, attachment_id, issued_date, created_by)
      values (${drawing.id}, 'Rev 2', ${attachmentId}, now() - interval '30 days', ${sara})
      returning id
    `;
    if (revision) await sql`update drawings set current_revision_id = ${revision.id} where id = ${drawing.id}`;
  }

  console.warn("Seeding Photos...");
  const [album] = await sql`insert into photo_albums (project_id, name) values (${buildingId}, 'Weekly Progress Photos') returning id`;
  for (let i = 1; i <= 6; i += 1) {
    await sql`
      insert into photos (project_id, album_id, attachment_id, taken_at, uploaded_by)
      values (${buildingId}, ${album?.id ?? null}, ${attachmentId}, now() - interval '${sql.unsafe(String(i * 5))} days', ${yousef})
    `;
  }

  console.warn("Seeding Meetings + items...");
  const meetingData: [string, string][] = [
    ["Weekly OAC Meeting #12", "-7 days"],
    ["Weekly OAC Meeting #13", "0 days"],
    ["Electrical Coordination Meeting", "-3 days"],
  ];
  for (const [title, offset] of meetingData) {
    const [meeting] = await sql`
      insert into meetings (project_id, title, occurred_at, attendees, created_by)
      values (${buildingId}, ${title}, now() + ${sql.unsafe(`interval '${offset}'`)}, ${JSON.stringify([
        { name: "Sara Haddad", companyId: gc },
        { name: "Karim Abu-Ghazaleh", companyId: owner },
      ])}::jsonb, ${sara})
      returning id
    `;
    if (!meeting) continue;
    await sql`
      insert into meeting_items (meeting_id, description, owner_user_id, status)
      values
        (${meeting.id}, 'Confirm curtain wall anchor detail per RFI-007', ${khalid}, 'open'),
        (${meeting.id}, 'Follow up on panel schedule discrepancy', ${omar}, 'open')
    `;
  }

  console.warn("Seeding Correspondence...");
  const corrData: [string, string, string, string, string, string, string][] = [
    ["CORR-001", "outgoing", "notice", "Notice of Delay -- Rock Excavation", gc, owner, "sent"],
    ["CORR-002", "incoming", "letter", "Request for Schedule Extension", sub2, gc, "acknowledged"],
    ["CORR-003", "outgoing", "memo", "Site Access Restrictions -- Ramadan Hours", gc, sub1, "sent"],
    ["CORR-004", "incoming", "notice", "Material Price Escalation Notice", sub1, gc, "closed"],
    ["CORR-005", "outgoing", "letter", "Substantial Completion Notice", gc, owner, "draft"],
  ];
  for (const [number, direction, type, subject, fromCompany, toCompany, status] of corrData) {
    await sql`
      insert into correspondence (project_id, correspondence_number, direction, type, subject, body, from_company_id, to_company_id, status, created_by)
      values (${buildingId}, ${number}, ${direction}, ${type}, ${subject}, ${"See attached for full details regarding: " + subject}, ${fromCompany}, ${toCompany}, ${status}, ${sara})
    `;
  }

  console.warn("Seeding T&M Tickets...");
  const tmData: [string, string, string][] = [
    ["TM-001", "Emergency dewatering pump rental due to unforeseen groundwater", "approved"],
    ["TM-002", "Additional labor for weekend concrete pour", "submitted"],
    ["TM-003", "Repair of damaged conduit run, cause under dispute", "draft"],
    ["TM-004", "Overtime electrical crew for panel swap", "rejected"],
  ];
  for (const [ticketNumber, description, status] of tmData) {
    await sql`
      insert into tm_tickets (project_id, ticket_number, company_id, work_date, description, status, submitted_by, created_by)
      values (${buildingId}, ${ticketNumber}, ${sub2}, now() - interval '5 days', ${description}, ${status}, ${khalid}, ${sara})
    `;
  }

  console.warn("Seeding Transmittals...");
  const transmittalData: [string, string, string, string][] = [
    ["TR-001", "Issued for Construction - Structural Drawings Rev 2", "for_construction", "sent"],
    ["TR-002", "Submittal Package - Concrete Mix Designs", "for_approval", "sent"],
    ["TR-003", "Record Drawings - Electrical", "for_information", "draft"],
  ];
  for (const [number, subject, purpose, status] of transmittalData) {
    await sql`
      insert into transmittals (project_id, transmittal_number, subject, purpose, status, created_by)
      values (${buildingId}, ${number}, ${subject}, ${purpose}, ${status}, ${sara})
    `;
  }

  console.warn("Seeding Safety Incidents + Observations...");
  const incidentData: [string, string, string, string][] = [
    ["near_miss", "Scaffold plank shifted underfoot, no fall occurred", "open", "not_recordable"],
    ["minor", "Worker sustained minor laceration from rebar tie wire", "closed", "days_away_from_work"],
    ["serious", "Worker fell from ladder, treated at clinic for sprained ankle", "investigating", "job_transfer_or_restriction"],
  ];
  for (const [severity, description, status, osha] of incidentData) {
    await sql`
      insert into safety_incidents (project_id, occurred_at, severity, description, status, osha_classification, reported_by)
      values (${buildingId}, now() - interval '10 days', ${severity}, ${description}, ${status}, ${osha}, ${fadi})
    `;
  }
  const observationData: [string, string, string][] = [
    ["unsafe_condition", "Extension cord routed through standing water near Level 1 entrance", "open"],
    ["unsafe_act", "Worker observed not wearing fall protection above 6ft", "resolved"],
    ["good_catch", "Foreman identified missing guardrail before crew started work", "resolved"],
    ["near_miss", "Load swung unexpectedly during crane pick, area was cleared in time", "open"],
  ];
  for (const [category, description, status] of observationData) {
    await sql`
      insert into safety_observations (project_id, observed_at, category, description, status, reported_by)
      values (${buildingId}, now() - interval '8 days', ${category}, ${description}, ${status}, ${fadi})
    `;
  }

  console.warn("Seeding Direct Costs...");
  const directCostData: [string, string, string, string][] = [
    ["03-300", "Ready-mix concrete delivery -- foundation pour", "48500", "approved"],
    ["26-000", "Electrical fixtures -- expedited freight", "6200", "pending"],
    ["09-900", "Paint materials", "4100", "approved"],
    ["07-200", "Waterproofing membrane materials", "12800", "pending"],
  ];
  for (const [code, description, amount, status] of directCostData) {
    await sql`
      insert into direct_costs (project_id, cost_code_id, description, amount, incurred_date, status, created_by)
      values (${buildingId}, ${cc(code)}, ${description}, ${amount}, now() - interval '20 days', ${status}, ${sara})
    `;
  }

  console.warn("Seeding Payment Applications (Billing)...");
  const [scComm] = await sql`select id from commitments where project_id = ${buildingId} and number = 'SC-002' limit 1`;
  await sql`
    insert into payment_applications (project_id, commitment_id, period_start, period_end, status, created_by)
    values
      (${buildingId}, ${scComm?.id ?? null}, now() - interval '60 days', now() - interval '30 days', 'paid', ${sara}),
      (${buildingId}, ${scComm?.id ?? null}, now() - interval '30 days', now(), 'submitted', ${sara})
  `;

  console.warn("Seeding Prequalification...");
  await sql`
    insert into prequalifications (project_id, company_id, status, bonding_capacity, annual_revenue, years_in_business, overall_score, created_by)
    values
      (${buildingId}, ${sub1}, 'qualified', '2000000', '8500000', '12', '88', ${sara}),
      (${buildingId}, ${sub2}, 'qualified', '3500000', '15000000', '20', '92', ${sara})
  `;

  console.warn("Seeding Bidding + Estimating...");
  await sql`
    insert into bid_packages (project_id, number, title, cost_code_id, status, due_date, created_by)
    values (${buildingId}, 'BP-001', 'Landscaping and Hardscape', null, 'open', now() + interval '21 days', ${sara})
  `;
  await sql`
    insert into bid_packages (project_id, number, title, status, created_by)
    values (${buildingId}, 'BP-002', 'Elevator Installation', 'awarded', ${sara})
  `;

  const [estimate] = await sql`
    insert into estimates (project_id, number, title, status, created_by)
    values (${buildingId}, 'EST-001', 'Rough Order of Magnitude -- Phase 2 Fit-out', 'final', ${sara})
    returning id
  `;
  if (estimate) {
    await sql`
      insert into estimate_line_items (estimate_id, cost_code_id, description, quantity, unit, unit_cost)
      values
        (${estimate.id}, ${cc("09-900")}, 'Interior paint, Level 2-4 units', '18000', 'sf', '2.10'),
        (${estimate.id}, ${cc("26-000")}, 'Additional lighting fixtures', '45', 'ea', '210.00')
    `;
  }

  console.warn("Seeding Schedule (manual task list)...");
  const taskData: [string, string, string, number, string][] = [
    ["Foundation Excavation", "-60 days", "-45 days", 100, "complete"],
    ["Foundation Concrete Pour", "-44 days", "-30 days", 100, "complete"],
    ["Structural Steel Erection - Levels 1-6", "-29 days", "0 days", 70, "in_progress"],
    ["Structural Steel Erection - Levels 7-12", "0 days", "30 days", 0, "not_started"],
    ["Electrical Rough-In - Levels 1-4", "-10 days", "20 days", 35, "in_progress"],
    ["Exterior Curtain Wall Installation", "10 days", "60 days", 0, "not_started"],
    ["Interior Finishes - Levels 1-4", "40 days", "90 days", 0, "not_started"],
    ["Elevator Installation", "20 days", "80 days", 0, "delayed"],
  ];
  for (let i = 0; i < taskData.length; i += 1) {
    const [name, startOffset, endOffset, percent, status] = taskData[i]!;
    await sql`
      insert into manual_schedule_tasks (project_id, name, start_date, end_date, percent_complete, status, sort_order, created_by)
      values (${buildingId}, ${name}, (now() + ${sql.unsafe(`interval '${startOffset}'`)})::date, (now() + ${sql.unsafe(`interval '${endOffset}'`)})::date, ${percent}, ${status}, ${i}, ${sara})
    `;
  }

  console.warn("Seeding CPM Schedule (Gantt) + version + tasks...");
  const [scheduleRow] = await sql`
    insert into schedules (project_id, source_tool, created_by)
    values (${buildingId}, 'manual', ${sara})
    returning id
  `;
  if (!scheduleRow) throw new Error("schedule insert failed");
  const [versionRow] = await sql`
    insert into schedule_versions (schedule_id, version_no, data_date, imported_from, imported_by)
    values (${scheduleRow.id}, 1, now()::date, 'manual', ${sara})
    returning id
  `;
  if (!versionRow) throw new Error("schedule version insert failed");
  await sql`update schedules set current_version_id = ${versionRow.id} where id = ${scheduleRow.id}`;

  const cpmTaskData: [string, string, string, number, boolean][] = [
    ["Foundation Excavation", "-60 days", "-45 days", 100, false],
    ["Foundation Concrete Pour", "-44 days", "-30 days", 100, true],
    ["Structural Steel Erection - Levels 1-6", "-29 days", "0 days", 70, true],
    ["Structural Steel Erection - Levels 7-12", "0 days", "30 days", 0, true],
    ["Electrical Rough-In - Levels 1-4", "-10 days", "20 days", 35, false],
    ["Exterior Curtain Wall Installation", "10 days", "60 days", 0, true],
  ];
  const cpmTaskIds: string[] = [];
  for (let i = 0; i < cpmTaskData.length; i += 1) {
    const [name, startOffset, endOffset, percent, isCritical] = cpmTaskData[i]!;
    const [task] = await sql`
      insert into schedule_tasks (version_id, wbs_code, name, planned_start, planned_finish, early_start, early_finish, percent_complete, is_critical, sort_order)
      values (
        ${versionRow.id}, ${"1." + String(i + 1)}, ${name},
        now() + ${sql.unsafe(`interval '${startOffset}'`)}, now() + ${sql.unsafe(`interval '${endOffset}'`)},
        now() + ${sql.unsafe(`interval '${startOffset}'`)}, now() + ${sql.unsafe(`interval '${endOffset}'`)},
        ${percent}, ${isCritical}, ${i}
      )
      returning id
    `;
    if (task) cpmTaskIds.push(task.id as string);
  }
  for (let i = 0; i < cpmTaskIds.length - 1; i += 1) {
    const predecessorId = cpmTaskIds[i];
    const successorId = cpmTaskIds[i + 1];
    if (!predecessorId || !successorId) continue;
    await sql`
      insert into task_dependencies (predecessor_id, successor_id, type)
      values (${predecessorId}, ${successorId}, 'FS')
    `;
  }
  const inProgressTaskId = cpmTaskIds[2];
  if (inProgressTaskId) {
    await sql`
      insert into schedule_progress_updates (task_id, submitted_by, proposed_percent_complete, note, status)
      values (${inProgressTaskId}, ${khalid}, 75, 'Level 5 steel erection ahead of schedule', 'pending')
    `;
    await sql`
      insert into schedule_constraints (task_id, category, description, owner_company_id, need_by_date, status, created_by)
      values (${inProgressTaskId}, 'material', 'Awaiting delivery of Level 6-9 steel bundles', ${sub2}, now() + interval '5 days', 'open', ${khalid})
    `;
  }

  console.warn("Seeding Lookahead Plan + commitments...");
  const [lookahead] = await sql`
    insert into lookahead_plans (project_id, week_start, horizon_weeks, created_by)
    values (${buildingId}, date_trunc('week', now())::date, 3, ${sara})
    returning id
  `;
  if (lookahead && inProgressTaskId) {
    await sql`
      insert into lookahead_commitments (lookahead_plan_id, task_id, promised_finish, committed_by_company_id, status)
      values (${lookahead.id}, ${inProgressTaskId}, (now() + interval '5 days')::date, ${sub2}, 'confirmed')
    `;
  }

  console.warn("Seeding Inspections + checklist template...");
  const [template] = await sql`
    insert into checklist_templates (project_id, title, created_by)
    values (${buildingId}, 'Concrete Pour Pre-Placement Checklist', ${sara})
    returning id
  `;
  if (template) {
    await sql`
      insert into checklist_template_items (template_id, prompt, response_type, "order")
      values
        (${template.id}, 'Formwork braced and plumb', 'pass_fail', 0),
        (${template.id}, 'Rebar placement matches drawings', 'pass_fail', 1),
        (${template.id}, 'Embeds and sleeves installed', 'pass_fail', 2)
    `;
    const inspectionData: [string, string | null][] = [
      ["completed", khalid],
      ["completed", khalid],
      ["scheduled", null],
    ];
    for (const [status, performedBy] of inspectionData) {
      await sql`
        insert into inspections (project_id, template_id, status, performed_by, scheduled_at, created_by)
        values (${buildingId}, ${template.id}, ${status}, ${performedBy}, now() + interval '2 days', ${sara})
      `;
    }
  }

  await sql.end();
  console.warn("\nDemo content seed complete across all modules for both projects.");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
