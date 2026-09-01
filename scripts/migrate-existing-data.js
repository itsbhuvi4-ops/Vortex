/**
 * VORTEX CLASH 2026 — Existing Data Migration Script
 * Migrates data from local data/database.json to Supabase PostgreSQL & Storage.
 *
 * Usage:
 *   node scripts/migrate-existing-data.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  supabase,
  isSupabaseConfigured,
  uploadToSupabaseStorage,
  saveSettingsToDb,
  saveSponsorToDb,
  saveRuleToDb,
  saveBracketToDb
} = require('../lib/supabase');

async function runMigration() {
  console.log('====================================================');
  console.log('  VORTEX CLASH 2026 — SUPABASE DATA MIGRATION');
  console.log('====================================================\n');

  if (!isSupabaseConfigured || !supabase) {
    console.error('ERROR: Supabase is not configured! Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env or environment.');
    process.exit(1);
  }

  const jsonDbPath = path.join(__dirname, '..', 'data', 'database.json');
  if (!fs.existsSync(jsonDbPath)) {
    console.log('No local data/database.json found to migrate.');
    return;
  }

  let dbData;
  try {
    const raw = fs.readFileSync(jsonDbPath, 'utf8');
    dbData = JSON.parse(raw);
  } catch (err) {
    console.error('Failed to parse database.json:', err.message);
    process.exit(1);
  }

  console.log('[1/5] Migrating Tournament Settings...');
  if (dbData.settings) {
    await saveSettingsToDb(dbData.settings);
    console.log('  ✓ Settings successfully migrated.');
  }

  console.log('\n[2/5] Migrating Sponsors & Uploading Logos...');
  if (Array.isArray(dbData.sponsors)) {
    for (const sp of dbData.sponsors) {
      let logoUrl = sp.logoUrl || sp.image_url;
      // If local file in uploads, upload to Supabase Storage
      if (logoUrl && logoUrl.startsWith('/uploads/')) {
        const localFilePath = path.join(__dirname, '..', 'public', logoUrl.replace('/', ''));
        const uploadsPath = path.join(__dirname, '..', logoUrl.replace('/', ''));
        const targetPath = fs.existsSync(localFilePath) ? localFilePath : (fs.existsSync(uploadsPath) ? uploadsPath : null);
        if (targetPath) {
          try {
            const buf = fs.readFileSync(targetPath);
            const ext = path.extname(targetPath).toLowerCase();
            const mime = ext === '.png' ? 'image/png' : (ext === '.webp' ? 'image/webp' : 'image/jpeg');
            logoUrl = await uploadToSupabaseStorage('sponsor-images', buf, path.basename(targetPath), mime);
            console.log(`    Uploaded sponsor logo for ${sp.name}: ${logoUrl}`);
          } catch (e) {
            console.warn(`    Could not upload sponsor image for ${sp.name}:`, e.message);
          }
        }
      }

      await saveSponsorToDb({
        ...sp,
        logoUrl: logoUrl
      });
      console.log(`  ✓ Sponsor "${sp.name}" migrated.`);
    }
  }

  console.log('\n[3/5] Migrating Rules...');
  if (Array.isArray(dbData.rules)) {
    for (const r of dbData.rules) {
      await saveRuleToDb(r);
      console.log(`  ✓ Rule "${r.title}" migrated.`);
    }
  }

  console.log('\n[4/5] Migrating Registered Teams & Payment Proofs...');
  if (Array.isArray(dbData.teams)) {
    for (const t of dbData.teams) {
      let paymentUrl = t.paymentProof;
      let teamLogoUrl = t.teamLogo;

      // Upload local payment proof to Supabase Storage
      if (paymentUrl && paymentUrl.startsWith('/uploads/')) {
        const targetPath = path.join(__dirname, '..', paymentUrl.replace('/', ''));
        if (fs.existsSync(targetPath)) {
          try {
            const buf = fs.readFileSync(targetPath);
            const ext = path.extname(targetPath).toLowerCase();
            const mime = ext === '.png' ? 'image/png' : (ext === '.webp' ? 'image/webp' : 'image/jpeg');
            paymentUrl = await uploadToSupabaseStorage('payment-proofs', buf, path.basename(targetPath), mime);
            console.log(`    Uploaded payment proof for team ${t.teamName}`);
          } catch (e) {
            console.warn(`    Failed to upload payment proof for ${t.teamName}:`, e.message);
          }
        }
      }

      // Check if team exists in Supabase
      const regId = t.registrationId || t.registrationNumber || `VORTEX001`;
      const { data: existingTeam } = await supabase
        .from('teams')
        .select('id')
        .eq('registration_id', regId)
        .maybeSingle();

      let teamId;
      if (!existingTeam) {
        const { data: insTeam, error: insErr } = await supabase
          .from('teams')
          .insert({
            registration_id: regId,
            team_name: t.teamName,
            leader_name: t.teamLeader,
            phone: t.phoneNumber || '',
            whatsapp: t.whatsappNumber || t.phoneNumber || '',
            substitute: t.substitute || '',
            joined_whatsapp: !!t.joinedWhatsapp,
            joined_discord: !!t.joinedDiscord,
            team_logo_url: teamLogoUrl,
            payment_proof_url: paymentUrl || '',
            status: 'approved',
            created_at: t.registeredAt || t.createdAt || new Date().toISOString()
          })
          .select()
          .single();

        if (insErr) {
          console.error(`  ✗ Error inserting team ${t.teamName}:`, insErr.message);
          continue;
        }
        teamId = insTeam.id;

        // Insert players
        const players = [
          { team_id: teamId, player_name: t.player1 || t.teamLeader, player_number: 1 },
          { team_id: teamId, player_name: t.player2 || 'Player 2', player_number: 2 },
          { team_id: teamId, player_name: t.player3 || 'Player 3', player_number: 3 },
          { team_id: teamId, player_name: t.player4 || 'Player 4', player_number: 4 }
        ];
        if (t.substitute) {
          players.push({ team_id: teamId, player_name: t.substitute, player_number: 5 });
        }

        await supabase.from('players').insert(players);
        console.log(`  ✓ Team "${t.teamName}" (${regId}) and roster migrated.`);
      } else {
        console.log(`  - Team "${t.teamName}" (${regId}) already exists in Supabase.`);
      }
    }
  }

  console.log('\n[5/5] Migrating Tournament Bracket & Matches...');
  if (dbData.bracket) {
    await saveBracketToDb(dbData.bracket);
    console.log(`  ✓ Bracket state with ${dbData.bracket.matches?.length || 0} matches migrated.`);
  }

  console.log('\n====================================================');
  console.log('  MIGRATION COMPLETED SUCCESSFULLY!');
  console.log('====================================================\n');
}

if (require.main === module) {
  runMigration().catch(err => {
    console.error('Migration failed with unexpected error:', err);
    process.exit(1);
  });
}

module.exports = { runMigration };
