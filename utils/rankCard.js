const { createCanvas, loadImage } = require('@napi-rs/canvas');

async function makeRankCard({
  username,
  avatarUrl,
  level,
  totalXp,
  rank,
  into,
  need,
}) {
  const width = 1000;
  const height = 360;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Dark background
  ctx.fillStyle = '#10131c';
  ctx.fillRect(0, 0, width, height);

  // Blue accent panel
  ctx.fillStyle = '#19243a';
  ctx.fillRect(0, 0, 12, height);

  // Decorative accent
  ctx.fillStyle = '#263858';
  ctx.fillRect(720, 0, 280, height);

  // Header
  ctx.fillStyle = '#8caeff';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('MEMBER PROFILE', 55, 48);

  // Avatar
  try {
    const avatar = await loadImage(avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(125, 145, 58, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, 67, 87, 116, 116);
    ctx.restore();
  } catch {
    ctx.fillStyle = '#354766';
    ctx.beginPath();
    ctx.arc(125, 145, 58, 0, Math.PI * 2);
    ctx.fill();
  }

  // Username
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px sans-serif';

  let displayName = String(username || 'Member');
  if (displayName.length > 22) {
    displayName = `${displayName.slice(0, 19)}...`;
  }

  ctx.fillText(displayName, 220, 120);

  // Level
  ctx.fillStyle = '#a9bce5';
  ctx.font = '20px sans-serif';
  ctx.fillText('LEVEL', 222, 158);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 42px sans-serif';
  ctx.fillText(String(level), 222, 205);

  // Rank
  ctx.fillStyle = '#a9bce5';
  ctx.font = '18px sans-serif';
  ctx.fillText('SERVER RANK', 55, 270);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(
    rank > 0 ? `#${rank}` : 'Unranked',
    55,
    310
  );

  // Total XP
  ctx.fillStyle = '#a9bce5';
  ctx.font = '18px sans-serif';
  ctx.fillText('TOTAL XP', 350, 270);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px sans-serif';
  ctx.fillText(
    Number(totalXp || 0).toLocaleString(),
    350,
    310
  );

  // Progress heading
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('LEVEL PROGRESS', 700, 85);

  // Progress numbers
  const safeNeed = Math.max(1, Number(need) || 1);
  const safeInto = Math.max(
    0,
    Math.min(Number(into) || 0, safeNeed)
  );

  ctx.fillStyle = '#b8c5df';
  ctx.font = '16px sans-serif';
  ctx.fillText(
    `${safeInto.toLocaleString()} / ${safeNeed.toLocaleString()} XP`,
    700,
    120
  );

  // Progress bar background
  const barX = 700;
  const barY = 145;
  const barWidth = 245;
  const barHeight = 16;

  ctx.fillStyle = '#35425b';
  ctx.beginPath();
  ctx.roundRect(barX, barY, barWidth, barHeight, 8);
  ctx.fill();

  // Progress bar fill
  const progress = Math.min(1, safeInto / safeNeed);

  if (progress > 0) {
    ctx.fillStyle = '#6f9bff';
    ctx.beginPath();
    ctx.roundRect(
      barX,
      barY,
      Math.max(8, barWidth * progress),
      barHeight,
      8
    );
    ctx.fill();
  }

  // Remaining XP
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 17px sans-serif';
  ctx.fillText(
    `${Math.max(0, safeNeed - safeInto).toLocaleString()} XP to next level`,
    700,
    195
  );

  // Footer
  ctx.fillStyle = '#7f8da8';
  ctx.font = '15px sans-serif';
  ctx.fillText('KEEP CHATTING. KEEP LEVELING.', 700, 320);

  return canvas.toBuffer('image/png');
}

module.exports = { makeRankCard };
