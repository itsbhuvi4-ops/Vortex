const path = require('path');
const fs = require('fs');

let createClient;
try {
  createClient = require('@supabase/supabase-js').createClient;
} catch (e) {
  createClient = null;
}

const bcrypt = require('bcryptjs');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

let supabase = null;
if (isSupabaseConfigured && createClient) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    console.log('[SUPABASE] Initialized production Supabase client');
  } catch (err) {
    console.error('[SUPABASE] Failed to initialize Supabase client:', err.message);
    supabase = null;
  }
} else {
  if (!isSupabaseConfigured) {
    console.warn('[SUPABASE] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  }
}

/**
 * Ensures initial admin account exists in Supabase PostgreSQL 'admins' table.
 */
async function ensureAdminUserExists() {
  if (!supabase) return;
  const adminEmail = (process.env.ADMIN_EMAIL || 'bhuvi@vortex.local').toLowerCase().trim();
  const adminPassword = process.env.ADMIN_PASSWORD || '1234';

  try {
    const passwordHash = await bcrypt.hash(adminPassword, 10);
    const { data: existing, error: findError } = await supabase
      .from('admins')
      .select('id, email')
      .eq('email', adminEmail)
      .maybeSingle();

    if (findError) {
      console.warn('[ADMIN AUTH] Notice checking admins table:', findError.message);
    }

    if (existing) {
      await supabase
        .from('admins')
        .update({
          password_hash: passwordHash,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
      console.log('[ADMIN AUTH] Admin credentials synchronized in Supabase');
    } else {
      await supabase
        .from('admins')
        .insert({
          email: adminEmail,
          password_hash: passwordHash,
          name: 'Admin',
          role: 'admin',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      console.log('[ADMIN AUTH] Initial admin account seeded in Supabase');
    }
  } catch (err) {
    console.error('[ADMIN AUTH ERROR] Failed to seed admin account:', err.message);
  }
}

// Auto-seed admin user asynchronously
if (supabase) {
  ensureAdminUserExists().catch(e => console.warn('[ADMIN SEED NOTICE]:', e.message));
}

// Allowed image MIME types and max size (5 MB)
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Upload an image buffer or base64 data to Supabase Storage.
 * @param {string} bucket - 'team-logos' | 'payment-proofs' | 'sponsor-images'
 * @param {Buffer|string} fileData - Buffer or base64 data URI
 * @param {string} [customFilename] - Optional filename
 * @param {string} [mimeType] - Optional MIME type
 * @returns {Promise<string>} Public URL of uploaded image
 */
async function uploadToSupabaseStorage(bucket, fileData, customFilename, mimeType) {
  if (!fileData) return null;

  let buffer;
  let resolvedMime = mimeType || 'image/png';

  // Handle Base64 Data URI
  if (typeof fileData === 'string' && fileData.startsWith('data:')) {
    const matches = fileData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      resolvedMime = matches[1].toLowerCase();
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      throw new Error('Invalid Base64 image format.');
    }
  } else if (Buffer.isBuffer(fileData)) {
    buffer = fileData;
  } else if (typeof fileData === 'string' && (fileData.startsWith('http://') || fileData.startsWith('https://'))) {
    // Already an external URL
    return fileData;
  } else {
    throw new Error('Invalid image payload provided.');
  }

  // Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(resolvedMime)) {
    throw new Error(`Unsupported image type: ${resolvedMime}. Allowed types: JPEG, PNG, WEBP.`);
  }

  // Validate File Size (5MB)
  if (buffer.length > MAX_IMAGE_SIZE) {
    throw new Error(`Image size exceeds 5MB limit (${(buffer.length / (1024 * 1024)).toFixed(2)} MB).`);
  }

  let ext = '.png';
  if (resolvedMime.includes('jpeg') || resolvedMime.includes('jpg')) ext = '.jpg';
  else if (resolvedMime.includes('webp')) ext = '.webp';

  const filename = customFilename 
    ? `${path.parse(customFilename).name}-${Date.now()}${ext}`
    : `${Date.now()}-${Math.random().toString(36).substring(2, 10)}${ext}`;

  if (supabase) {
    const isPublicBucket = bucket !== 'payment-proofs';
    // Upload via Supabase Storage SDK
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filename, buffer, {
        contentType: resolvedMime,
        cacheControl: '3600',
        upsert: true
      });

    if (error) {
      console.error(`[SUPABASE STORAGE ERROR] Bucket ${bucket}:`, error.message);
      // Fallback: If bucket does not exist, attempt to create it then retry
      if (error.message && (error.message.includes('not found') || error.message.includes('does not exist'))) {
        try {
          await supabase.storage.createBucket(bucket, { public: isPublicBucket });
          const retry = await supabase.storage.from(bucket).upload(filename, buffer, { contentType: resolvedMime, upsert: true });
          if (!retry.error) {
            if (isPublicBucket) {
              const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filename);
              return publicUrlData.publicUrl;
            } else {
              // Private bucket: return relative path or storage identifier
              return `storage:payment-proofs/${filename}`;
            }
          }
        } catch (e) {
          console.error('[SUPABASE STORAGE] Bucket creation retry failed:', e.message);
        }
      }
      throw new Error(`Failed to upload to Supabase Storage: ${error.message}`);
    }

    if (isPublicBucket) {
      const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filename);
      return publicUrlData.publicUrl;
    } else {
      // Private bucket: return reference identifier for signed URL generation
      return `storage:payment-proofs/${filename}`;
    }
  } else {
    // If Supabase credentials are not yet supplied, write to local uploads safely with warning
    const uploadDir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const localPath = path.join(uploadDir, filename);
    fs.writeFileSync(localPath, buffer);
    return `/uploads/${filename}`;
  }
}

/**
 * Generate a short-lived (1 hour) signed URL for viewing private payment proofs (Admin Only)
 */
async function getSignedPaymentProofUrl(paymentProofIdentifier) {
  if (!paymentProofIdentifier) return null;
  if (paymentProofIdentifier.startsWith('/uploads/') || paymentProofIdentifier.startsWith('http://') || paymentProofIdentifier.startsWith('https://')) {
    return paymentProofIdentifier;
  }

  let filename = paymentProofIdentifier;
  if (filename.startsWith('storage:payment-proofs/')) {
    filename = filename.replace('storage:payment-proofs/', '');
  } else if (filename.includes('/payment-proofs/')) {
    filename = filename.split('/payment-proofs/').pop();
  }

  if (supabase) {
    try {
      const { data, error } = await supabase.storage
        .from('payment-proofs')
        .createSignedUrl(filename, 3600); // 1 hour valid

      if (!error && data?.signedUrl) {
        return data.signedUrl;
      }
      console.warn('[SUPABASE STORAGE] Failed to create signed URL:', error?.message);
    } catch (err) {
      console.error('[SUPABASE STORAGE] createSignedUrl exception:', err.message);
    }
  }
  return paymentProofIdentifier;
}

/**
 * Get Tournament Settings from Supabase
 */
async function getSettingsFromDb() {
  if (supabase) {
    const { data, error } = await supabase
      .from('tournament_settings')
      .select('key, value')
      .eq('key', 'general')
      .maybeSingle();

    if (!error && data && data.value) {
      return data.value;
    }
  }
  return null;
}

/**
 * Save Tournament Settings to Supabase
 */
async function saveSettingsToDb(settings) {
  if (supabase) {
    const { data, error } = await supabase
      .from('tournament_settings')
      .upsert({
        key: 'general',
        value: settings,
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' })
      .select();

    if (error) {
      console.error('[SUPABASE ERROR] saveSettingsToDb:', error.message);
      throw error;
    }
    return data;
  }
  return null;
}

/**
 * Fetch all teams and their players
 */
async function getTeamsFromDb() {
  if (supabase) {
    const { data: teamsData, error: teamsError } = await supabase
      .from('teams')
      .select(`
        id,
        registration_id,
        team_name,
        leader_name,
        phone,
        whatsapp,
        substitute,
        joined_whatsapp,
        joined_discord,
        team_logo_url,
        payment_proof_url,
        status,
        user_id,
        created_at,
        players (
          id,
          player_name,
          player_uid,
          player_number
        )
      `)
      .order('created_at', { ascending: false });

    if (teamsError) {
      console.error('[SUPABASE ERROR] getTeamsFromDb:', teamsError.message);
      throw teamsError;
    }

    return (teamsData || []).map(t => {
      const pMap = {};
      (t.players || []).forEach(p => {
        pMap[`player${p.player_number}`] = p.player_name;
      });

      return {
        id: t.id,
        userId: t.user_id,
        registrationNumber: t.registration_id,
        registrationId: t.registration_id,
        teamName: t.team_name,
        teamLogo: t.team_logo_url,
        teamLeader: t.leader_name,
        phoneNumber: t.phone,
        whatsappNumber: t.whatsapp,
        player1: pMap.player1 || t.leader_name || '',
        player2: pMap.player2 || '',
        player3: pMap.player3 || '',
        player4: pMap.player4 || '',
        substitute: t.substitute || pMap.player5 || '',
        paymentProof: t.payment_proof_url,
        joinedWhatsapp: !!t.joined_whatsapp,
        joinedDiscord: !!t.joined_discord,
        status: t.status,
        registeredAt: t.created_at,
        createdAt: t.created_at
      };
    });
  }
  return null;
}

/**
 * Atomic Team Registration in Supabase
 */
async function registerTeamInDb(teamData, maxTeams = 30) {
  if (!supabase) return null;

  const cleanPhone = String(teamData.phoneNumber || '').trim();
  const cleanWhatsApp = String(teamData.whatsappNumber || '').trim();
  const userId = teamData.userId || null;

  // 1. Try PostgreSQL atomic registration procedure first for absolute concurrency safety
  try {
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('register_team_atomic', {
      p_team_name: String(teamData.teamName).trim(),
      p_leader_name: String(teamData.teamLeader).trim(),
      p_phone: cleanPhone,
      p_whatsapp: cleanWhatsApp,
      p_team_logo_url: teamData.teamLogo || '',
      p_payment_proof_url: teamData.paymentProof || '',
      p_player1: String(teamData.player1).trim(),
      p_player2: String(teamData.player2).trim(),
      p_player3: String(teamData.player3).trim(),
      p_player4: String(teamData.player4).trim(),
      p_substitute: teamData.substitute ? String(teamData.substitute).trim() : '',
      p_joined_whatsapp: !!teamData.joinedWhatsapp,
      p_joined_discord: !!teamData.joinedDiscord,
      p_user_id: userId,
      p_max_teams: Number(maxTeams || 30)
    });

    if (!rpcErr && rpcRes) {
      if (!rpcRes.success) {
        return rpcRes;
      }

      return {
        success: true,
        team: {
          id: rpcRes.id,
          registrationId: rpcRes.registration_id,
          registrationNumber: rpcRes.registration_id,
          teamName: rpcRes.team_name,
          teamLeader: rpcRes.leader_name,
          phoneNumber: rpcRes.phone,
          whatsappNumber: rpcRes.whatsapp,
          player1: rpcRes.player1,
          player2: rpcRes.player2,
          player3: rpcRes.player3,
          player4: rpcRes.player4,
          substitute: rpcRes.substitute || '',
          paymentProof: rpcRes.payment_proof_url,
          joinedWhatsapp: !!teamData.joinedWhatsapp,
          joinedDiscord: !!teamData.joinedDiscord,
          registeredAt: rpcRes.created_at,
          createdAt: rpcRes.created_at
        }
      };
    }
  } catch (err) {
    console.warn('[SUPABASE RPC NOTICE] Procedure fallback:', err.message);
  }

  // 2. Fallback JS logic if stored procedure is not active
  const { data: existing, error: existErr } = await supabase
    .from('teams')
    .select('id, registration_id, team_name, phone, whatsapp, user_id')
    .or(`phone.eq."${cleanPhone}",whatsapp.eq."${cleanWhatsApp}"${userId ? `,user_id.eq."${userId}"` : ''}`)
    .limit(1);

  if (existErr) {
    console.error('[SUPABASE ERROR] check duplicate team:', existErr.message);
  }

  if (existing && existing.length > 0) {
    return {
      success: false,
      duplicate: true,
      error: 'A team with this phone number or session has already registered.',
      team: existing[0]
    };
  }

  const { count, error: countErr } = await supabase
    .from('teams')
    .select('*', { count: 'exact', head: true });

  if (countErr) {
    console.error('[SUPABASE ERROR] count teams:', countErr.message);
  }

  if (count !== null && count >= maxTeams) {
    return {
      success: false,
      full: true,
      error: 'Registration closed. Maximum team capacity reached.'
    };
  }

  let regId = null;
  try {
    const { data: rpcRegId, error: rpcErr } = await supabase.rpc('get_next_registration_id');
    if (!rpcErr && rpcRegId) {
      regId = rpcRegId;
    }
  } catch (e) {
    // fallback if function not created
  }

  if (!regId) {
    const currentTotal = count || 0;
    regId = `VC2026-${String(currentTotal + 1).padStart(4, '0')}`;
  }

  const { data: insertedTeam, error: insertErr } = await supabase
    .from('teams')
    .insert({
      registration_id: regId,
      team_name: String(teamData.teamName).trim(),
      leader_name: String(teamData.teamLeader).trim(),
      phone: cleanPhone,
      whatsapp: cleanWhatsApp,
      substitute: teamData.substitute ? String(teamData.substitute).trim() : '',
      joined_whatsapp: !!teamData.joinedWhatsapp,
      joined_discord: !!teamData.joinedDiscord,
      team_logo_url: teamData.teamLogo,
      payment_proof_url: teamData.paymentProof,
      status: 'approved',
      user_id: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (insertErr) {
    console.error('[SUPABASE ERROR] insert team:', insertErr.message);
    if (insertErr.code === '23505') {
      return { success: false, duplicate: true, error: 'Duplicate registration detected.' };
    }
    throw insertErr;
  }

  const playersList = [
    { team_id: insertedTeam.id, player_name: String(teamData.player1).trim(), player_number: 1 },
    { team_id: insertedTeam.id, player_name: String(teamData.player2).trim(), player_number: 2 },
    { team_id: insertedTeam.id, player_name: String(teamData.player3).trim(), player_number: 3 },
    { team_id: insertedTeam.id, player_name: String(teamData.player4).trim(), player_number: 4 }
  ];

  if (teamData.substitute && String(teamData.substitute).trim()) {
    playersList.push({
      team_id: insertedTeam.id,
      player_name: String(teamData.substitute).trim(),
      player_number: 5
    });
  }

  const { error: playersErr } = await supabase
    .from('players')
    .insert(playersList);

  if (playersErr) {
    console.error('[SUPABASE ERROR] insert players:', playersErr.message);
  }

  return {
    success: true,
    team: {
      id: insertedTeam.id,
      registrationId: insertedTeam.registration_id,
      registrationNumber: insertedTeam.registration_id,
      teamName: insertedTeam.team_name,
      teamLogo: insertedTeam.team_logo_url,
      teamLeader: insertedTeam.leader_name,
      phoneNumber: insertedTeam.phone,
      whatsappNumber: insertedTeam.whatsapp,
      player1: teamData.player1,
      player2: teamData.player2,
      player3: teamData.player3,
      player4: teamData.player4,
      substitute: teamData.substitute || '',
      paymentProof: insertedTeam.payment_proof_url,
      joinedWhatsapp: !!insertedTeam.joined_whatsapp,
      joinedDiscord: !!insertedTeam.joined_discord,
      registeredAt: insertedTeam.created_at,
      createdAt: insertedTeam.created_at
    }
  };
}

/**
 * Update Team in DB
 */
async function updateTeamInDb(idOrRegId, updateFields) {
  if (!supabase) return null;

  const dbFields = {};
  if (updateFields.teamName) dbFields.team_name = updateFields.teamName;
  if (updateFields.teamLeader) dbFields.leader_name = updateFields.teamLeader;
  if (updateFields.phoneNumber) dbFields.phone = updateFields.phoneNumber;
  if (updateFields.whatsappNumber) dbFields.whatsapp = updateFields.whatsappNumber;
  if (updateFields.teamLogo) dbFields.team_logo_url = updateFields.teamLogo;
  if (updateFields.paymentProof) dbFields.payment_proof_url = updateFields.paymentProof;
  if (updateFields.substitute !== undefined) dbFields.substitute = updateFields.substitute;
  if (updateFields.status) dbFields.status = updateFields.status;
  dbFields.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('teams')
    .update(dbFields)
    .or(`id.eq."${idOrRegId}",registration_id.eq."${idOrRegId}"`)
    .select()
    .single();

  if (error) {
    console.error('[SUPABASE ERROR] updateTeamInDb:', error.message);
    throw error;
  }
  return data;
}

/**
 * Delete Team from DB
 */
async function deleteTeamFromDb(idOrRegId) {
  if (!supabase) return null;

  const { error } = await supabase
    .from('teams')
    .delete()
    .or(`id.eq."${idOrRegId}",registration_id.eq."${idOrRegId}"`);

  if (error) {
    console.error('[SUPABASE ERROR] deleteTeamFromDb:', error.message);
    throw error;
  }
  return true;
}

/**
 * Sponsors DB operations
 */
async function getSponsorsFromDb() {
  if (supabase) {
    const { data, error } = await supabase
      .from('sponsors')
      .select('*')
      .order('order_number', { ascending: true })
      .order('created_at', { ascending: true });

    if (!error && data) {
      return data.map(s => ({
        id: s.id,
        name: s.name,
        role: s.role,
        description: s.description,
        logoUrl: s.image_url,
        profileLink: s.link || '#',
        orderIndex: s.order_number || 1,
        createdAt: s.created_at
      }));
    }
  }
  return null;
}

async function saveSponsorToDb(sponsor) {
  if (!supabase) return null;

  const row = {
    name: sponsor.name,
    role: sponsor.role,
    description: sponsor.description || '',
    image_url: sponsor.logoUrl || sponsor.image_url || '',
    link: sponsor.profileLink || sponsor.link || '#',
    order_number: Number(sponsor.orderIndex || sponsor.order_number || 1),
    updated_at: new Date().toISOString()
  };

  if (sponsor.id && !sponsor.id.startsWith('sp-')) {
    row.id = sponsor.id;
  }

  const { data, error } = await supabase
    .from('sponsors')
    .upsert(row)
    .select()
    .single();

  if (error) {
    console.error('[SUPABASE ERROR] saveSponsorToDb:', error.message);
    throw error;
  }
  return {
    id: data.id,
    name: data.name,
    role: data.role,
    description: data.description,
    logoUrl: data.image_url,
    profileLink: data.link,
    orderIndex: data.order_number,
    createdAt: data.created_at
  };
}

async function deleteSponsorFromDb(id) {
  if (!supabase) return null;
  const { error } = await supabase.from('sponsors').delete().eq('id', id);
  if (error) throw error;
  return true;
}

/**
 * Rules DB operations
 */
async function getRulesFromDb() {
  if (supabase) {
    const { data, error } = await supabase
      .from('rules')
      .select('*')
      .order('order_number', { ascending: true })
      .order('created_at', { ascending: true });

    if (!error && data) {
      return data.map(r => ({
        id: r.id,
        category: r.category || 'Tournament Rules',
        title: r.title,
        content: r.content,
        description: r.description,
        orderIndex: r.order_number || 1,
        createdAt: r.created_at
      }));
    }
  }
  return null;
}

async function saveRuleToDb(rule) {
  if (!supabase) return null;

  const row = {
    category: rule.category || 'Tournament Rules',
    title: rule.title,
    content: rule.content,
    description: rule.description || '',
    order_number: Number(rule.orderIndex || rule.order_number || 1),
    updated_at: new Date().toISOString()
  };

  if (rule.id && !rule.id.startsWith('r-')) {
    row.id = rule.id;
  }

  const { data, error } = await supabase
    .from('rules')
    .upsert(row)
    .select()
    .single();

  if (error) {
    console.error('[SUPABASE ERROR] saveRuleToDb:', error.message);
    throw error;
  }
  return {
    id: data.id,
    category: data.category,
    title: data.title,
    content: data.content,
    description: data.description,
    orderIndex: data.order_number,
    createdAt: data.created_at
  };
}

async function deleteRuleFromDb(id) {
  if (!supabase) return null;
  const { error } = await supabase.from('rules').delete().eq('id', id);
  if (error) throw error;
  return true;
}

/**
 * Bracket & Matches DB operations
 */
async function getBracketFromDb() {
  if (!supabase) return null;

  const { data: matchesData, error: mError } = await supabase
    .from('matches')
    .select('*')
    .order('round_index', { ascending: true })
    .order('match_number', { ascending: true });

  const { data: settingsData } = await supabase
    .from('tournament_settings')
    .select('value')
    .eq('key', 'bracket_meta')
    .maybeSingle();

  const meta = settingsData?.value || {
    status: 'UNPUBLISHED',
    isLocked: false,
    totalRounds: 0,
    championTeamId: null
  };

  if (!mError && matchesData && matchesData.length > 0) {
    const mappedMatches = matchesData.map(m => ({
      id: m.match_code,
      matchId: m.id,
      round: Number(m.round) || (m.round_index + 1),
      roundIndex: m.round_index,
      roundName: m.round_name,
      matchNumber: m.match_number,
      team1Id: m.team1_reg_id,
      team2Id: m.team2_reg_id,
      winnerId: m.winner_reg_id,
      nextMatchId: m.next_match_id,
      nextMatchSlot: m.next_match_slot,
      scheduledTime: m.scheduled_time,
      status: m.status,
      score: m.score,
      locked: m.locked
    }));

    return {
      status: meta.status || 'UNPUBLISHED',
      isLocked: !!meta.isLocked,
      totalRounds: meta.totalRounds || Math.max(...mappedMatches.map(m => m.round), 0),
      championTeamId: meta.championTeamId || null,
      matches: mappedMatches
    };
  }
  return null;
}

async function saveBracketToDb(bracket) {
  if (!supabase || !bracket) return null;

  // 1. Save metadata
  await supabase
    .from('tournament_settings')
    .upsert({
      key: 'bracket_meta',
      value: {
        status: bracket.status,
        isLocked: bracket.isLocked,
        totalRounds: bracket.totalRounds,
        championTeamId: bracket.championTeamId
      },
      updated_at: new Date().toISOString()
    }, { onConflict: 'key' });

  // 2. Save matches
  if (bracket.matches && bracket.matches.length > 0) {
    const rows = bracket.matches.map(m => ({
      match_code: m.id,
      round: String(m.round),
      round_index: m.roundIndex !== undefined ? m.roundIndex : (m.round - 1),
      round_name: m.roundName || `Round ${m.round}`,
      match_number: m.matchNumber,
      team1_reg_id: m.team1Id || null,
      team2_reg_id: m.team2Id || null,
      winner_reg_id: m.winnerId || null,
      next_match_id: m.nextMatchId || null,
      next_match_slot: m.nextMatchSlot || null,
      scheduled_time: m.scheduledTime ? new Date(m.scheduledTime).toISOString() : null,
      status: m.status || 'UPCOMING',
      locked: !!bracket.isLocked,
      updated_at: new Date().toISOString()
    }));

    const { error } = await supabase
      .from('matches')
      .upsert(rows, { onConflict: 'match_code' });

    if (error) {
      console.error('[SUPABASE ERROR] save matches:', error.message);
    }
  }

  return bracket;
}

module.exports = {
  supabase,
  isSupabaseConfigured,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  uploadToSupabaseStorage,
  getSignedPaymentProofUrl,
  ensureAdminUserExists,
  getSettingsFromDb,
  saveSettingsToDb,
  getTeamsFromDb,
  registerTeamInDb,
  updateTeamInDb,
  deleteTeamFromDb,
  getSponsorsFromDb,
  saveSponsorToDb,
  deleteSponsorFromDb,
  getRulesFromDb,
  saveRuleToDb,
  deleteRuleFromDb,
  getBracketFromDb,
  saveBracketToDb
};
