import { Client } from 'pg';
import * as xlsx from 'xlsx';

async function run() {
    console.log("Starting DB migration & seeding for DC Documents...");
    
    // Hardcoding for the seed script since env hoisting is causing issues
    const client = new Client({
        connectionString: 'postgresql://aku-sparta:0hhUTvTHKtgkN8TfLadC@103.127.99.241:5432/building?sslmode=disable'
    });
    
    await client.connect();
    
    try {
        await client.query('BEGIN');
        
        // 1. Clear old data
        console.log("Clearing old dc_archive_project and related docs...");
        
        // Delete all dc_document related to DC_ARCHIVE_PROJECT
        await client.query(`DELETE FROM dc_document_version WHERE document_id IN (SELECT id FROM dc_document WHERE entity_type = 'DC_ARCHIVE_PROJECT')`);
        await client.query(`DELETE FROM dc_document WHERE entity_type = 'DC_ARCHIVE_PROJECT'`);
        
        // Delete all legacy projects & archive projects
        await client.query(`DELETE FROM dc_activity_log WHERE entity_type = 'DC_ARCHIVE_PROJECT' OR (entity_type = 'DC_PROJECT' AND project_id IN (SELECT id FROM dc_project WHERE status = 'LEGACY_ARCHIVE'))`);
        await client.query(`DELETE FROM dc_project_member WHERE source_entity_type = 'DC_ARCHIVE_PROJECT' OR project_id IN (SELECT id FROM dc_project WHERE status = 'LEGACY_ARCHIVE')`);
        
        await client.query(`DELETE FROM dc_archive_project`);
        await client.query(`DELETE FROM dc_project WHERE status = 'LEGACY_ARCHIVE'`);
        
        console.log("Old data cleared. Reading Excel file...");
        
        // 2. Read Excel
        const filePath = 'c:/alfamart/backup/data/LIST DATA Penyimpanan dokumen DC.xlsx';
        const wb = xlsx.readFile(filePath);
        
        // Parse 01-DC
        const dcSheet = wb.Sheets['01-DC'];
        const dcData = xlsx.utils.sheet_to_json(dcSheet, { header: 1 }) as string[][];
        const dcRows = dcData.slice(4).filter(r => r[1] && r[2]);
        
        // Parse 02-WAREHOUSE (02-WAREHOSUE)
        const whSheet = wb.Sheets['02-WAREHOSUE'] || wb.Sheets['02-WAREHOUSE'];
        const whData = xlsx.utils.sheet_to_json(whSheet, { header: 1 }) as string[][];
        const whRows = whData.slice(4).filter(r => r[1] && r[2]);
        
        const ACTOR_EMAIL = 'system@sparta.com';
        const ACTOR_ROLE = 'SYSTEM';
        
        let totalSeeded = 0;
        
        // Insert function
        const insertArchive = async (kode: string, nama: string, cabang: string, isWh: boolean) => {
            const projectRes = await client.query(
                `INSERT INTO dc_project (
                    project_code, project_name, location_name, branch_name, address,
                    status, current_stage, created_by_email, created_by_role,
                    created_at, updated_at
                ) VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8, timezone('Asia/Jakarta', now()), timezone('Asia/Jakarta', now()))
                RETURNING id`,
                [
                    kode,
                    nama,
                    null,
                    cabang || (isWh ? 'HEAD OFFICE' : 'HEAD OFFICE'),
                    null,
                    'LEGACY_ARCHIVE',
                    ACTOR_EMAIL,
                    ACTOR_ROLE
                ]
            );
            const projectId = projectRes.rows[0].id;
            
            await client.query(
                `INSERT INTO dc_archive_project (
                    project_id, archive_code, archive_name, branch_name, location_name,
                    project_type, address, notes, created_by_email, created_by_role,
                    created_at, updated_at
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, timezone('Asia/Jakarta', now()), timezone('Asia/Jakarta', now()))`,
                [
                    projectId,
                    kode,
                    nama,
                    cabang || (isWh ? 'HEAD OFFICE' : 'HEAD OFFICE'),
                    null,
                    isWh ? 'Warehouse' : 'DC',
                    null,
                    'Seeded from Excel',
                    ACTOR_EMAIL,
                    ACTOR_ROLE
                ]
            );
            totalSeeded++;
        };
        
        for (const row of dcRows) {
            const kode = String(row[1]).trim();
            const nama = String(row[2]).trim();
            const cabang = String(row[3] || '').trim(); // Using Inisial as Cabang fallback if needed, wait, we don't have explicit Cabang in 01-DC?
            // Actually 'Inisial' is just a code like 'BDG1'.
            // For archive, branch_name is required by backend, let's just use the Inisial or Nama as branch.
            let branch = 'HEAD OFFICE'; // Default to HO for national data if no proper branch mapping.
            // Some names like "DC BANDUNG", let's extract branch
            if (nama.toUpperCase().includes('BANDUNG')) branch = 'BANDUNG';
            else if (nama.toUpperCase().includes('SEMARANG')) branch = 'SEMARANG';
            else if (nama.toUpperCase().includes('CILACAP')) branch = 'CILACAP';
            else if (nama.toUpperCase().includes('CILEUNGSI')) branch = 'CILEUNGSI';
            else if (nama.toUpperCase().includes('CIKOKOL')) branch = 'CIKOKOL';
            else if (nama.toUpperCase().includes('LAMPUNG')) branch = 'LAMPUNG';
            // Fallback:
            else branch = cabang || 'HEAD OFFICE';
            
            await insertArchive(kode, nama, branch, false);
        }
        
        for (const row of whRows) {
            const kode = String(row[1]).trim();
            const nama = String(row[2]).trim();
            let branch = 'HEAD OFFICE';
            if (nama.toUpperCase().includes('BANDUNG')) branch = 'BANDUNG';
            else if (nama.toUpperCase().includes('BENGKULU')) branch = 'BENGKULU';
            else if (nama.toUpperCase().includes('KOTABUMI')) branch = 'KOTABUMI';
            else if (nama.toUpperCase().includes('PALANGKARAYA')) branch = 'PALANGKARAYA';
            else if (nama.toUpperCase().includes('BEREBEK')) branch = 'SIDOARJO'; // Berebek
            else if (nama.toUpperCase().includes('BALARAJA')) branch = 'BALARAJA';
            else branch = String(row[3] || 'HEAD OFFICE');
            
            await insertArchive(kode, nama, branch, true);
        }
        
        await client.query('COMMIT');
        console.log(`Seeding complete. Inserted ${totalSeeded} records.`);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Migration failed:", error);
    } finally {
        await client.end();
    }
}

run();
