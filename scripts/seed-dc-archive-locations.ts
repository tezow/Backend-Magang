import { Client } from "pg";
import * as xlsx from "xlsx";
import path from "path";

const BRANCH_GROUPS: Record<string, string[]> = {
    "BANDUNG RAYA": ["BANDUNG RAYA", "BANDUNG", "BANDUNG 1", "BANDUNG 2"],
    LOMBOK: ["LOMBOK", "SUMBAWA"],
    CILEUNGSI: ["CILEUNGSI", "BOGOR", "BEKASI", "KARAWANG"],
    CIKOKOL: ["CIKOKOL", "PARUNG", "BALARAJA", "SERANG", "BINTAN"],
    MEDAN: ["MEDAN", "ACEH"],
    LAMPUNG: ["LAMPUNG", "KOTABUMI"],
    PALEMBANG: ["PALEMBANG", "BENGKULU", "BANGKA", "BELITUNG"],
    SIDOARJO: ["SIDOARJO", "SIDOARJO BPN SMD", "MANOKWARI", "NTT", "SORONG"],
};

const TYPE_LABEL: Record<string, string> = {
    DC: "DC",
    WAREHOUSE: "Warehouse",
    DEPO: "Depo",
    BULKY: "Bulky",
    STORE_HUB: "Store-Hub",
    GUDANG_ANAK: "Gudang Anak",
};

type DcMaster = {
    no: string;
    code: string;
    name: string;
    initialCode: string;
    branchName: string;
    parentBranchName: string;
};

type LocationRow = {
    code: string;
    name: string;
    initialCode: string | null;
    archiveType: string;
    projectType: string;
    branchName: string;
    parentBranchName: string;
    parentDcCode: string | null;
    parentDcName: string | null;
    sourceSheet: string;
};

const normalize = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ");
const upper = (value: unknown) => normalize(value).replace(/_+/g, " ").toUpperCase();

const parentBranchFor = (branch: string) => {
    const normalized = upper(branch);
    for (const [parent, group] of Object.entries(BRANCH_GROUPS)) {
        if (group.map(upper).includes(normalized)) return parent;
    }
    return normalized || "HEAD OFFICE";
};

const branchFromDcName = (name: string) => {
    const cleaned = upper(name).replace(/^DC\s+/, "").replace(/\s+\d+$/, "");
    if (cleaned === "BANDUNG") return "BANDUNG";
    return cleaned || "HEAD OFFICE";
};

const branchFromLocationName = (name: string, fallback: string) => {
    const value = upper(name);
    const rules: Array<[RegExp, string]> = [
        [/BANDUNG/, "BANDUNG"],
        [/BENGKULU/, "BENGKULU"],
        [/KOTABUMI/, "KOTABUMI"],
        [/PALANGKARAYA/, "PALANGKARAYA"],
        [/BEREBEK/, "SIDOARJO"],
        [/BALARAJA/, "BALARAJA"],
        [/PARUNG/, "PARUNG"],
        [/SERANG/, "SERANG"],
        [/BOGOR/, "BOGOR"],
        [/KARAWANG/, "KARAWANG"],
        [/BEKASI/, "BEKASI"],
        [/SORONG/, "SORONG"],
        [/SUMBAWA/, "SUMBAWA"],
        [/PANGKAL\s*PINANG/, "BANGKA"],
        [/MANGGAR|BADAU/, "BELITUNG"],
        [/BALIKPAPAN|SAMARINDA/, "SIDOARJO BPN SMD"],
        [/KUPANG|LABUAN BAJO|MAUMERE|WAE CES|WAIKABUBAK|SOE/, "NTT"],
        [/LHOKSEUMAWE|BANDA ACEH/, "ACEH"],
        [/PEMATANG SIANTAR/, "MEDAN"],
        [/AMBON/, "PONTIANAK"],
        [/JAMBI/, "JAMBI"],
        [/CIPINANG/, "CILEUNGSI"],
        [/IMAM BONJOL|BTN SIMP TRIKORA|KAWAL PANTAI/, "CIKOKOL"],
        [/SOLO/, "KLATEN"],
        [/BALI/, "BALI"],
        [/PLUMBON|PRONGGOL/, "PLUMBON"],
        [/BIAK|MANOKWARI|KAIMANA/, "MANOKWARI"],
        [/SEMARANG/, "SEMARANG"],
        [/LAMPUNG/, "LAMPUNG"],
    ];
    for (const [pattern, branch] of rules) {
        if (pattern.test(value)) return branch;
    }
    return fallback;
};

const getSheetRows = (workbook: xlsx.WorkBook, sheetName: string): unknown[][] => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error(`Sheet ${sheetName} tidak ditemukan`);
    return xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as unknown[][];
};

const parseWorkbook = (filePath: string): LocationRow[] => {
    const workbook = xlsx.readFile(filePath);
    const dcRows = getSheetRows(workbook, "01-DC").slice(4);
    const dcMasters: DcMaster[] = dcRows
        .map((row) => {
            const code = upper(row[1]);
            const name = normalize(row[2]);
            const initialCode = upper(row[3]);
            const branchName = branchFromDcName(name);
            return {
                no: normalize(row[0]),
                code,
                name,
                initialCode,
                branchName,
                parentBranchName: parentBranchFor(branchName),
            };
        })
        .filter((row) => row.code && row.name && row.code !== "KODE");

    const dcByCode = new Map(dcMasters.map((dc) => [dc.code, dc]));
    const dcByInitial = new Map(dcMasters.filter((dc) => dc.initialCode).map((dc) => [dc.initialCode, dc]));
    const locations: LocationRow[] = dcMasters.map((dc) => ({
        code: dc.code,
        name: dc.name,
        initialCode: dc.initialCode || null,
        archiveType: "DC",
        projectType: TYPE_LABEL.DC,
        branchName: dc.branchName,
        parentBranchName: dc.parentBranchName,
        parentDcCode: null,
        parentDcName: null,
        sourceSheet: "01-DC",
    }));

    const childSheets = [
        { sheet: "02-WAREHOSUE", archiveType: "WAREHOUSE", nameCol: 2, codeCol: 1, initialCol: 3, parentCol: 4 },
        { sheet: "03-DEPO", archiveType: "DEPO", nameCol: 2, codeCol: 1, initialCol: 3, parentCol: 4 },
        { sheet: "04-BULKY", archiveType: "BULKY", nameCol: 2, codeCol: 1, initialCol: 3, parentCol: 4 },
        { sheet: "05-STORE-HUB", archiveType: "STORE_HUB", nameCol: 2, codeCol: 1, initialCol: 3, parentCol: 4 },
        { sheet: "06-GUDANG ANAK", archiveType: "GUDANG_ANAK", nameCol: 1, codeCol: -1, initialCol: -1, parentCol: 2 },
    ];

    for (const config of childSheets) {
        const rows = getSheetRows(workbook, config.sheet).slice(4);
        for (const row of rows) {
            const no = normalize(row[0]);
            const name = normalize(row[config.nameCol]);
            if (!name || name.toUpperCase().startsWith("NAMA ")) continue;
            if (!no && config.archiveType !== "GUDANG_ANAK") continue;
            if (!no && config.archiveType === "GUDANG_ANAK" && !upper(name).startsWith("GUDANG ANAK")) continue;
            if (no.toUpperCase() === "NO") continue;

            const rawParent = upper(row[config.parentCol]);
            if (!rawParent) continue;
            const parent = dcByCode.get(rawParent) ?? dcByInitial.get(rawParent);
            if (!parent) throw new Error(`${config.sheet}: DC Induk ${rawParent} untuk ${name} tidak ditemukan`);

            const rawCode = config.codeCol >= 0 ? upper(row[config.codeCol]) : "";
            const code = rawCode || `GA-${parent.code}-${no || upper(name).replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
            const initialCode = config.initialCol >= 0 ? upper(row[config.initialCol]) : "";
            const branchName = branchFromLocationName(name, parent.branchName);

            locations.push({
                code,
                name,
                initialCode: initialCode || null,
                archiveType: config.archiveType,
                projectType: TYPE_LABEL[config.archiveType],
                branchName,
                parentBranchName: parentBranchFor(branchName),
                parentDcCode: parent.code,
                parentDcName: parent.name,
                sourceSheet: config.sheet,
            });
        }
    }

    const duplicateCodes = locations.map((item) => item.code).filter((code, index, all) => all.indexOf(code) !== index);
    if (duplicateCodes.length) throw new Error(`Kode duplikat di workbook: ${Array.from(new Set(duplicateCodes)).join(", ")}`);
    return locations;
};

const upsertLocation = async (client: Client, item: LocationRow) => {
    const projectResult = await client.query<{ id: number; inserted: boolean }>(
        `INSERT INTO dc_project (
            project_code, project_name, location_name, branch_name, address,
            status, current_stage, created_by_email, created_by_role, created_at, updated_at
        ) VALUES ($1,$2,NULL,$3,NULL,'LEGACY_ARCHIVE','LEGACY_ARCHIVE','system@sparta.com','SYSTEM', timezone('Asia/Jakarta', now()), timezone('Asia/Jakarta', now()))
        ON CONFLICT (project_code) DO UPDATE SET
            project_name = EXCLUDED.project_name,
            branch_name = EXCLUDED.branch_name,
            status = 'LEGACY_ARCHIVE',
            current_stage = 'LEGACY_ARCHIVE',
            updated_at = timezone('Asia/Jakarta', now())
        RETURNING id, (xmax = 0) AS inserted`,
        [item.code, item.name, item.branchName]
    );
    const projectId = projectResult.rows[0].id;

    const archiveResult = await client.query<{ id: number; inserted: boolean }>(
        `INSERT INTO dc_archive_project (
            project_id, archive_code, archive_name, branch_name, location_name,
            project_type, archive_type, initial_code, parent_dc_code, parent_dc_name,
            parent_branch_name, address, notes, created_by_email, created_by_role,
            created_at, updated_at
        ) VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,$10,NULL,$11,'system@sparta.com','SYSTEM', timezone('Asia/Jakarta', now()), timezone('Asia/Jakarta', now()))
        ON CONFLICT (archive_code) DO UPDATE SET
            project_id = EXCLUDED.project_id,
            archive_name = EXCLUDED.archive_name,
            branch_name = EXCLUDED.branch_name,
            project_type = EXCLUDED.project_type,
            archive_type = EXCLUDED.archive_type,
            initial_code = EXCLUDED.initial_code,
            parent_dc_code = EXCLUDED.parent_dc_code,
            parent_dc_name = EXCLUDED.parent_dc_name,
            parent_branch_name = EXCLUDED.parent_branch_name,
            notes = EXCLUDED.notes,
            updated_at = timezone('Asia/Jakarta', now())
        RETURNING id, (xmax = 0) AS inserted`,
        [
            projectId,
            item.code,
            item.name,
            item.branchName,
            item.projectType,
            item.archiveType,
            item.initialCode,
            item.parentDcCode,
            item.parentDcName,
            item.parentBranchName,
            `Seeded from ${item.sourceSheet}`,
        ]
    );

    return {
        projectInserted: projectResult.rows[0].inserted,
        archiveInserted: archiveResult.rows[0].inserted,
    };
};

const main = async () => {
    const commit = process.argv.includes("--commit");
    const workbookArgIndex = process.argv.findIndex((arg) => arg === "--file");
    const workbookPath = workbookArgIndex >= 0 && process.argv[workbookArgIndex + 1]
        ? path.resolve(process.argv[workbookArgIndex + 1])
        : path.resolve(process.cwd(), "..", "data", "LIST DATA Penyimpanan dokumen DC.xlsx");
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL wajib di-set");

    const locations = parseWorkbook(workbookPath);
    const summary = locations.reduce<Record<string, number>>((acc, item) => {
        acc[item.archiveType] = (acc[item.archiveType] ?? 0) + 1;
        return acc;
    }, {});
    if (locations.length !== 73) throw new Error(`Target lokasi harus 73, terbaca ${locations.length}`);

    const client = new Client({ connectionString });
    await client.connect();
    try {
        await client.query("BEGIN");
        let inserted = 0;
        let updated = 0;
        for (const location of locations) {
            const result = await upsertLocation(client, location);
            if (result.archiveInserted) inserted++; else updated++;
        }
        const dbCounts = await client.query<{ archive_type: string; count: string }>(
            `SELECT archive_type, COUNT(*)::text AS count
             FROM dc_archive_project
             GROUP BY archive_type
             ORDER BY archive_type`
        );
        if (commit) await client.query("COMMIT");
        else await client.query("ROLLBACK");
        console.log(JSON.stringify({ mode: commit ? "commit" : "preview_rollback", workbookPath, targetCount: locations.length, summary, inserted, updated, dbCounts: dbCounts.rows }, null, 2));
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        await client.end();
    }
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
