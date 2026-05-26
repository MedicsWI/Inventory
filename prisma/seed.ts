// Seed script — creates a starter admin, sample categories, locations, items.
// Run with: pnpm db:seed
import { PrismaClient, LocationType, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // --- Admin user ---
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@medicswi.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe!123";
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: Role.ADMIN },
    create: {
      email: adminEmail,
      name: "Inventory Admin",
      role: Role.ADMIN,
      passwordHash,
    },
  });
  console.log(`Seeded admin: ${admin.email} / ${adminPassword}  (CHANGE THIS)`);

  // --- Categories ---
  const categories = await Promise.all(
    [
      { name: "Airway", color: "#0ea5e9" },
      { name: "IV / Fluids", color: "#22c55e" },
      { name: "Medications", color: "#a855f7" },
      { name: "Bandaging", color: "#f59e0b" },
      { name: "Diagnostics", color: "#ef4444" },
      { name: "PPE", color: "#64748b" },
    ].map((c) =>
      prisma.category.upsert({
        where: { name: c.name },
        update: {},
        create: c,
      }),
    ),
  );

  // --- Locations (nested) ---
  const station = await prisma.location.upsert({
    where: { barcode: "LOC-STATION-1" },
    update: {},
    create: {
      name: "Station 1",
      type: LocationType.STATION,
      barcode: "LOC-STATION-1",
    },
  });

  const truck = await prisma.location.upsert({
    where: { barcode: "LOC-MED-12" },
    update: {},
    create: {
      name: "Medic 12",
      type: LocationType.VEHICLE,
      barcode: "LOC-MED-12",
      parentId: station.id,
    },
  });

  const traumaKit = await prisma.location.upsert({
    where: { barcode: "LOC-TRAUMA-KIT-A" },
    update: {},
    create: {
      name: "Trauma Kit A",
      type: LocationType.KIT,
      barcode: "LOC-TRAUMA-KIT-A",
      parentId: truck.id,
    },
  });

  // --- Items ---
  const airway = categories.find((c) => c.name === "Airway")!;
  const meds = categories.find((c) => c.name === "Medications")!;
  const bandage = categories.find((c) => c.name === "Bandaging")!;

  const items = [
    {
      name: "OPA — 90mm",
      barcode: "ITEM-OPA-90",
      quantity: 4,
      unit: "each",
      lowStockThreshold: 2,
      categoryId: airway.id,
      locationId: traumaKit.id,
      expirationDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 25), // ~25 days (warning band)
      lotNumber: "LOT-A1",
    },
    {
      name: "Epinephrine 1:10,000 (1mg/10mL)",
      barcode: "ITEM-EPI-110K",
      quantity: 6,
      unit: "syringe",
      lowStockThreshold: 4,
      categoryId: meds.id,
      locationId: traumaKit.id,
      expirationDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 75), // ~75 days
      lotNumber: "LOT-EPI-993",
    },
    {
      name: "Israeli Bandage 6\"",
      barcode: "ITEM-IBAND-6",
      quantity: 2,
      unit: "each",
      lowStockThreshold: 3, // intentionally low to demo alert
      categoryId: bandage.id,
      locationId: traumaKit.id,
    },
    {
      name: "Aspirin 81mg chewable",
      barcode: "ITEM-ASA-81",
      quantity: 30,
      unit: "tablet",
      lowStockThreshold: 20,
      categoryId: meds.id,
      locationId: traumaKit.id,
      expirationDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3), // expired (demo)
      lotNumber: "LOT-ASA-44",
    },
  ];

  for (const item of items) {
    await prisma.item.upsert({
      where: { barcode: item.barcode },
      update: item,
      create: item,
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
