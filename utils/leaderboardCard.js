const { createCanvas, loadImage } = require('@napi-rs/canvas');

const WIDTH = 1200;
const HEIGHT = 1000;

const BLUE = '#168cff';
const PALE_BLUE = '#8bcaff';
const WHITE = '#f3f7ff';
const MUTED = '#9aaec8';

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);

  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
  let value = String(text || 'Unknown');

  while (
    value.length > 3 &&
    ctx.measureText(value).width > maxWidth
  ) {
    value = value.slice(0, -2) + '…';
  }

  return value;
}

async function loadAvatar(url) {
  try {
    return await loadImage(url);
  } catch {
    return null;
  }
}

async function makeLeaderboardCard({
  entries,
  page,
  pageCount,
  totalMembers,
}) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Dark futuristic background.
  const background = ctx.createLinearGradient(
    0, 0, WIDTH, HEIGHT
  );

  background.addColorStop(0, '#050b16');
  background.addColorStop(0.55, '#0a1830');
  background.addColorStop(1, '#030711');

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glow = ctx.createRadialGradient(
    600, 220, 20, 600, 220, 700
  );

  glow.addColorStop(0, 'rgba(0, 126, 255, 0.22)');
  glow.addColorStop(1, 'rgba(0, 126, 255, 0)');

  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Angular blue details.
  ctx.strokeStyle = 'rgba(22, 140, 255, 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 110);
  ctx.lineTo(170, 0);
  ctx.moveTo(WIDTH, 145);
  ctx.lineTo(1030, 0);
  ctx.moveTo(0, 930);
  ctx.lineTo(130, HEIGHT);
  ctx.moveTo(WIDTH, 900);
  ctx.lineTo(1080, HEIGHT);
  ctx.stroke();

  // Header.
  ctx.textAlign = 'center';
  ctx.fillStyle = WHITE;
  ctx.font = '700 24px sans-serif';
  ctx.fillText('SERVER XP RANKINGS', WIDTH / 2, 52);

  ctx.font = '900 58px sans-serif';
  ctx.fillText('LEADERBOARD', WIDTH / 2, 115);

  ctx.fillStyle = PALE_BLUE;
  ctx.font = '600 18px sans-serif';
  ctx.fillText(
    'TOP MEMBERS BY TOTAL XP',
    WIDTH / 2,
    151
  );

  // Highlight the first three entries on this page.
  const topThree = entries.slice(0, 3);

  const podium = [
    {
      x: 70, y: 210, w: 320, h: 245,
      item: topThree[1], place: 2,
      color: '#b9d4f2',
    },
    {
      x: 440, y: 180, w: 320, h: 275,
      item: topThree[0], place: 1,
      color: '#ffc94f',
    },
    {
      x: 810, y: 210, w: 320, h: 245,
      item: topThree[2], place: 3,
      color: '#d78d63',
    },
  ];

  for (const panel of podium) {
    if (!panel.item) continue;

    ctx.save();
    ctx.shadowColor = panel.color;
    ctx.shadowBlur = panel.place === 1 ? 24 : 12;
    ctx.fillStyle = 'rgba(7, 18, 37, 0.96)';
    ctx.strokeStyle = panel.color;
    ctx.lineWidth = panel.place === 1 ? 3 : 2;

    roundedRect(
      ctx, panel.x, panel.y, panel.w, panel.h, 18
    );

    ctx.fill();
    ctx.stroke();
    ctx.restore();

    const absolutePosition = page * 10 + panel.place;

    ctx.textAlign = 'center';
    ctx.fillStyle = panel.color;
    ctx.font = '900 36px sans-serif';
    ctx.fillText(
      '#' + absolutePosition,
      panel.x + panel.w / 2,
      panel.y + 43
    );

    const avatar = await loadAvatar(panel.item.avatarUrl);
    const avatarX = panel.x + panel.w / 2;
    const avatarY = panel.y + (
      panel.place === 1 ? 105 : 100
    );
    const avatarSize = panel.place === 1 ? 78 : 66;

    ctx.save();
    ctx.beginPath();
    ctx.arc(
      avatarX,
      avatarY,
      avatarSize / 2 + 4,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = 'rgba(22, 140, 255, 0.22)';
    ctx.fill();
    ctx.strokeStyle = BLUE;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.clip();

    if (avatar) {
      ctx.drawImage(
        avatar,
        avatarX - avatarSize / 2,
        avatarY - avatarSize / 2,
        avatarSize,
        avatarSize
      );
    } else {
      ctx.fillStyle = '#132b4c';
      ctx.fillRect(
        avatarX - avatarSize / 2,
        avatarY - avatarSize / 2,
        avatarSize,
        avatarSize
      );

      ctx.fillStyle = WHITE;
      ctx.font = '700 30px sans-serif';
      ctx.fillText(
        String(panel.item.name || '?').charAt(0).toUpperCase(),
        avatarX,
        avatarY + 10
      );
    }

    ctx.restore();

    ctx.fillStyle = WHITE;
    ctx.font = '800 24px sans-serif';
    ctx.fillText(
      fitText(ctx, panel.item.name, panel.w - 36),
      avatarX,
      panel.y + 166
    );

    ctx.fillStyle = PALE_BLUE;
    ctx.font = '700 19px sans-serif';
    ctx.fillText(
      'LEVEL ' + panel.item.level,
      avatarX,
      panel.y + 198
    );

    ctx.fillStyle = WHITE;
    ctx.font = '700 21px sans-serif';
    ctx.fillText(
      Number(panel.item.xp).toLocaleString() + ' XP',
      avatarX,
      panel.y + 226
    );
  }

  // Remaining seven entries on the page.
  const listY = 490;
  const listH = 390;

  ctx.fillStyle = 'rgba(3, 10, 22, 0.88)';
  ctx.strokeStyle = 'rgba(22, 140, 255, 0.75)';
  ctx.lineWidth = 2;

  roundedRect(ctx, 55, listY, 1090, listH, 18);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.font = '700 17px sans-serif';
  ctx.fillStyle = PALE_BLUE;
  ctx.fillText('#', 82, 528);
  ctx.fillText('MEMBER', 145, 528);
  ctx.fillText('LEVEL', 790, 528);

  ctx.textAlign = 'right';
  ctx.fillText('TOTAL XP', 1095, 528);

  const listEntries = entries.slice(3, 10);
  const rowStart = 570;
  const rowGap = 43;

  for (let i = 0; i < listEntries.length; i += 1) {
    const item = listEntries[i];
    const y = rowStart + i * rowGap;
    const position = page * 10 + i + 4;

    ctx.strokeStyle = 'rgba(42, 103, 169, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(78, y + 15);
    ctx.lineTo(1120, y + 15);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = WHITE;
    ctx.font = '700 20px sans-serif';
    ctx.fillText(String(position), 82, y);

    const avatar = await loadAvatar(item.avatarUrl);

    ctx.save();
    ctx.beginPath();
    ctx.arc(172, y - 7, 15, 0, Math.PI * 2);
    ctx.clip();

    if (avatar) {
      ctx.drawImage(avatar, 157, y - 22, 30, 30);
    } else {
      ctx.fillStyle = '#15365d';
      ctx.fillRect(157, y - 22, 30, 30);
    }

    ctx.restore();

    ctx.fillStyle = WHITE;
    ctx.font = '600 19px sans-serif';
    ctx.fillText(
      fitText(ctx, item.name, 470),
      200,
      y
    );

    ctx.fillStyle = PALE_BLUE;
    ctx.font = '700 18px sans-serif';
    ctx.fillText(String(item.level), 790, y);

    ctx.textAlign = 'right';
    ctx.fillStyle = WHITE;
    ctx.font = '700 18px sans-serif';
    ctx.fillText(
      Number(item.xp).toLocaleString() + ' XP',
      1095,
      y
    );
  }

  // Footer.
  ctx.fillStyle = 'rgba(4, 13, 28, 0.96)';
  ctx.strokeStyle = 'rgba(22, 140, 255, 0.75)';

  roundedRect(ctx, 55, 905, 1090, 58, 15);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = MUTED;
  ctx.font = '600 16px sans-serif';
  ctx.fillText('TRACKED MEMBERS', 82, 929);

  ctx.fillStyle = WHITE;
  ctx.font = '800 22px sans-serif';
  ctx.fillText(String(totalMembers), 82, 953);

  ctx.textAlign = 'center';
  ctx.fillStyle = PALE_BLUE;
  ctx.font = '700 18px sans-serif';
  ctx.fillText(
    'PAGE ' + (page + 1) + ' / ' + pageCount,
    WIDTH / 2,
    941
  );

  ctx.textAlign = 'right';
  ctx.fillStyle = MUTED;
  ctx.font = '600 15px sans-serif';
  ctx.fillText(
    'KEEP CHATTING. KEEP LEVELING.',
    1115,
    941
  );

  return canvas.toBuffer('image/png');
}

module.exports = { makeLeaderboardCard };
