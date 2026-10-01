require("dotenv").config();
const pool = require("./db");

// Fields are broad career categories. Each mentor belongs to exactly one.
// Colors are deliberately muted/earthy to match the ledger design system
// rather than bright "category tag" colors.
const FIELDS = [
  { slug: "tech-it", name: "Tech & IT", color: "#2F5233" },
  { slug: "business-management", name: "Business & Management", color: "#4A6FA5" },
  { slug: "finance-accounting", name: "Finance & Accounting", color: "#9C7A3C" },
  { slug: "creative-design", name: "Creative & Design", color: "#C1544B" },
  { slug: "marketing-communications", name: "Marketing & Communications", color: "#E0A526" },
  { slug: "law-legal", name: "Law & Legal", color: "#5C4B8A" },
  { slug: "healthcare-medicine", name: "Healthcare & Medicine", color: "#2E8B7E" },
  { slug: "engineering-construction", name: "Engineering & Construction", color: "#8A5A3B" },
  { slug: "environment-agriculture", name: "Environment & Agriculture", color: "#6B8E4E" },
  { slug: "entrepreneurship-startups", name: "Entrepreneurship & Startups", color: "#D4762A" },
];

// Every mentor is fictional seed/demo data, not a real person.
const MENTORS = [
  // Tech & IT (the original four)
  {
    field: "tech-it",
    name: "Ama Boateng",
    title: "Senior Product Manager",
    bio: "10 years shipping consumer products. Happy to talk roadmaps, interviews, or breaking into PM from another field.",
  },
  {
    field: "tech-it",
    name: "Kwame Owusu",
    title: "Software Engineer",
    bio: "Backend-leaning full-stack engineer. Can help with technical interview prep, system design basics, or career pivots into tech.",
  },
  {
    field: "tech-it",
    name: "Efua Mensah",
    title: "UX Designer",
    bio: "Portfolio reviews, design critique, and advice on landing your first design role.",
  },
  {
    field: "tech-it",
    name: "Nana Yaw Asante",
    title: "Data Analyst",
    bio: "SQL, dashboards, and how to talk about data work in interviews without drowning people in jargon.",
  },

  // Business & Management
  {
    field: "business-management",
    name: "Abena Osei",
    title: "Operations Manager",
    bio: "Runs cross-functional teams at a logistics company. Happy to talk management fundamentals, career transitions into ops, or how to run a meeting that doesn't waste everyone's time.",
  },
  {
    field: "business-management",
    name: "Kojo Antwi",
    title: "Retail General Manager",
    bio: "15 years managing retail operations and people. Can help with leadership basics, performance reviews, and moving from individual contributor to manager.",
  },
  {
    field: "business-management",
    name: "Nii Armah Clottey",
    title: "HR Manager",
    bio: "Talent acquisition and people ops at a mid-size company. Can talk HR career paths, running fair hiring processes, and building a people function from scratch.",
  },

  // Finance & Accounting
  {
    field: "finance-accounting",
    name: "Yaa Asantewaa Darko",
    title: "Chartered Accountant",
    bio: "Audits and financial statements for a mid-size firm. Good for accounting fundamentals, certification paths, and breaking into finance without a finance degree.",
  },
  {
    field: "finance-accounting",
    name: "Kwabena Frimpong",
    title: "Investment Analyst",
    bio: "Equity research at an asset management firm. Can talk financial modeling, how to read a balance sheet, or prepping for finance interviews.",
  },
  {
    field: "finance-accounting",
    name: "Efua Boateng-Mensah",
    title: "Financial Controller",
    bio: "Oversees reporting and budgeting for a manufacturing company. Good for management accounting basics and moving from accountant to finance lead.",
  },

  // Creative & Design
  {
    field: "creative-design",
    name: "Akosua Boadi",
    title: "Brand & Graphic Designer",
    bio: "Freelance brand designer. Portfolio critiques, pricing freelance work, and building a design practice outside the 9-to-5.",
  },
  {
    field: "creative-design",
    name: "Yaw Darko-Mensah",
    title: "Illustrator & Motion Designer",
    bio: "Illustration and short-form animation for brands. Happy to talk tools, style development, and landing freelance clients.",
  },
  {
    field: "creative-design",
    name: "Nana Ama Serwaa",
    title: "Fashion Designer",
    bio: "Runs an independent clothing label. Happy to talk building a creative brand, sourcing production, and selling direct-to-consumer.",
  },
  {
    field: "creative-design",
    name: "Kwabena Asare",
    title: "Photographer",
    bio: "Commercial and portrait photography. Can help with building a portfolio, pricing shoots, and going full-time freelance.",
  },

  // Marketing & Communications
  {
    field: "marketing-communications",
    name: "Adwoa Sarpong",
    title: "Marketing Manager",
    bio: "Runs growth marketing for a consumer app. Can help with campaign strategy, positioning, and marketing career paths.",
  },
  {
    field: "marketing-communications",
    name: "Kwesi Mensah-Bonsu",
    title: "PR & Communications Specialist",
    bio: "Media relations and corporate comms. Good for writing press releases, crisis comms basics, and breaking into PR.",
  },
  {
    field: "marketing-communications",
    name: "Abena Dufie Appiah",
    title: "Social Media Strategist",
    bio: "Builds organic content strategy for consumer brands. Can talk content planning, growing an audience, and breaking into social media roles.",
  },

  // Law & Legal
  {
    field: "law-legal",
    name: "Abena Owusu-Ansah",
    title: "Corporate Lawyer",
    bio: "Commercial law at an Accra firm. Can discuss contract basics, law school prep, and corporate law career paths.",
  },
  {
    field: "law-legal",
    name: "Kwame Addo",
    title: "Legal Aid Attorney",
    bio: "Public interest law. Happy to talk about legal aid work, bar exam prep, and alternatives to corporate law.",
  },

  // Healthcare & Medicine
  {
    field: "healthcare-medicine",
    name: "Dr. Efua Appiah",
    title: "General Practitioner",
    bio: "Family medicine physician. Can talk medical school admissions, residency, or a day in the life of a GP.",
  },
  {
    field: "healthcare-medicine",
    name: "Abena Nyarko",
    title: "Registered Nurse",
    bio: "ICU nurse with 8 years' experience. Good for nursing school questions, clinical career paths, and avoiding burnout in healthcare.",
  },
  {
    field: "healthcare-medicine",
    name: "Dr. Kwaku Agyemang",
    title: "Pharmacist",
    bio: "Community pharmacy practice. Good for pharmacy school questions and clinical vs. retail pharmacy career paths.",
  },
  {
    field: "healthcare-medicine",
    name: "Afia Nkrumah",
    title: "Physiotherapist",
    bio: "Sports injury rehab. Can talk physiotherapy training routes and what it's like working with athletes day to day.",
  },

  // Engineering & Construction
  {
    field: "engineering-construction",
    name: "Kwaku Boateng",
    title: "Civil Engineer",
    bio: "Structural design for mid-rise buildings. Can help with engineering fundamentals, licensure, and construction project basics.",
  },
  {
    field: "engineering-construction",
    name: "Yaw Oppong",
    title: "Electrical Engineer",
    bio: "Power systems design. Happy to talk electrical engineering career paths and moving between design work and site work.",
  },
  {
    field: "engineering-construction",
    name: "Yaw Antwi-Boasiako",
    title: "Mechanical Engineer",
    bio: "Manufacturing and plant engineering. Happy to talk mechanical engineering fundamentals and moving between design and plant-floor roles.",
  },

  // Environment & Agriculture
  {
    field: "environment-agriculture",
    name: "Abena Kyere",
    title: "Agronomist",
    bio: "Crop science and sustainable farming advisory. Can talk agribusiness, food security work, and careers in agricultural science.",
  },
  {
    field: "environment-agriculture",
    name: "Kofi Nkrumah-Asiedu",
    title: "Environmental Scientist",
    bio: "Environmental impact assessments and conservation policy. Good for sustainability career paths and breaking into environmental work.",
  },
  {
    field: "environment-agriculture",
    name: "Kojo Asiedu-Mensah",
    title: "Sustainability Consultant",
    bio: "Advises companies on ESG and carbon reporting. Can talk sustainability career paths and breaking in without a science background.",
  },

  // Entrepreneurship & Startups
  {
    field: "entrepreneurship-startups",
    name: "Nana Akua Frempong",
    title: "Startup Founder",
    bio: "Founded and scaled a fintech startup. Can talk fundraising, early hiring, and the realities of founder life.",
  },
  {
    field: "entrepreneurship-startups",
    name: "Kwabena Owusu-Darko",
    title: "Startup Operator",
    bio: "Among the first 10 hires at two startups. Good for how to evaluate a startup job offer and what early-stage work actually looks like.",
  },
  {
    field: "entrepreneurship-startups",
    name: "Abena Asamoah",
    title: "Growth Marketer & Co-founder",
    bio: "Co-founded a direct-to-consumer brand. Can talk early customer acquisition, bootstrapping, and juggling multiple hats as an early founder.",
  },
];

const SLOT_START_HOUR = 9; // 09:00
const MORNING_END_HOUR = 12; // slots stop at 12:00, resume at 13:00
const SLOT_END_HOUR = 17; // 17:00
const SLOT_MINUTES = 30;
const DAYS_AHEAD = 14; // generate slots for the next 14 calendar days (~10 weekdays)
const WEEKDAYS_ONLY = true;

function isWeekday(date) {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6;
}

function* slotTimesForDay(dayStart) {
  for (let hour = SLOT_START_HOUR; hour < SLOT_END_HOUR; hour++) {
    if (hour >= MORNING_END_HOUR && hour < 13) continue; // lunch break
    for (let min = 0; min < 60; min += SLOT_MINUTES) {
      const start = new Date(dayStart);
      start.setUTCHours(hour, min, 0, 0);
      const end = new Date(start.getTime() + SLOT_MINUTES * 60 * 1000);
      yield { start, end };
    }
  }
}

async function seed() {
  // Fields: upsert by slug so re-running (every boot) is a no-op once seeded,
  // but still picks up a color tweak if one is made in code later.
  const fieldIds = {};
  for (const f of FIELDS) {
    const result = await pool.query(
      `INSERT INTO fields (slug, name, color) VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, color = EXCLUDED.color
       RETURNING id`,
      [f.slug, f.name, f.color]
    );
    fieldIds[f.slug] = result.rows[0].id;
  }
  console.log(`✓ ${FIELDS.length} fields ready.`);

  // Mentors: upsert by name (unique index) so existing mentors keep their id
  // (and their already-booked slots stay linked), while new ones get created
  // and everyone's field_id/title/bio/color stays in sync with this file.
  const mentorIds = [];
  for (const m of MENTORS) {
    const fieldId = fieldIds[m.field];
    const color = m.color || FIELDS.find((f) => f.slug === m.field).color;
    const result = await pool.query(
      `INSERT INTO mentors (name, title, bio, color, field_id) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (name) DO UPDATE SET
         title = EXCLUDED.title, bio = EXCLUDED.bio, color = EXCLUDED.color, field_id = EXCLUDED.field_id
       RETURNING id`,
      [m.name, m.title, m.bio, color, fieldId]
    );
    mentorIds.push(result.rows[0].id);
  }
  console.log(`✓ ${mentorIds.length} mentors ready.`);

  let slotsCreated = 0;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (let d = 1; d <= DAYS_AHEAD; d++) {
    const day = new Date(today.getTime() + d * 24 * 60 * 60 * 1000);
    if (WEEKDAYS_ONLY && !isWeekday(day)) continue;

    for (const mentorId of mentorIds) {
      for (const { start, end } of slotTimesForDay(day)) {
        const result = await pool.query(
          `INSERT INTO slots (mentor_id, start_time, end_time)
           VALUES ($1, $2, $3)
           ON CONFLICT (mentor_id, start_time) DO NOTHING`,
          [mentorId, start.toISOString(), end.toISOString()]
        );
        slotsCreated += result.rowCount;
      }
    }
  }
  console.log(`✓ ${slotsCreated} new slots created (existing ones left untouched).`);
  await pool.end();
}

seed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
