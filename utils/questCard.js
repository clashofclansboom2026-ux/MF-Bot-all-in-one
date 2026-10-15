
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const WIDTH = 1200;
const HEIGHT = 820;

const C = {
  bg: '#050a13',
  panel: '#0b1423',
  panel2: '#101e32',
  blue: '#075bff',
  cyan: '#19cfff',
  white: '#f4f8ff',
  muted: '#8da5c5',
  track: '#1a2b43',
  green: '#20d9a0',
};

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function panel(ctx, x, y, width, height, radius = 22) {
  roundedRect(ctx, x, y, width, height, radius);
  ctx.fillStyle = C.panel;
  ctx.fill();
  ctx.strokeStyle = '#1a426d';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function gradient(ctx, x, y, width, height, first = C.blue, second = C.cyan) {
  const g = ctx.createLinearGradient(x, y, x + width, y + height);
  g.addColorStop(0, first);
  g.addColorStop(1, second);
  return g;
}

function fitText(ctx, text, maxWidth, startSize, weight = '700') {
  let size = startSize;

  while (size > 16) {
    ctx.font = `${weight} ${size}px Arial`;

    if (ctx.measureText(String(text)).width <= maxWidth) break;

    size -= 2;
  }

  return size;
}

function drawProgress(ctx, x, y, width, height, progress, target) {
  const ratio = target > 0
    ? Math.max(0, Math.min(1, progress / target))
    : 0;

  roundedRect(ctx, x, y, width, height, height / 2);
  ctx.fillStyle = C.track;
  ctx.fill();

  if (ratio > 0) {
    roundedRect(
      ctx,
      x,
      y,
      Math.max(height, width * ratio),
      height,
      height / 2
    );

    ctx.fillStyle = gradient(ctx, x, y, width, height);
    ctx.fill();
  }

  return Math.floor(ratio * 100);
}

async function makeQuestCard({ username, avatarUrl, botIconUrl, quests }) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  // Background and angular electric-blue accents.
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = C.blue;

  ctx.beginPath();
  ctx.moveTo(870, 0);
  ctx.lineTo(WIDTH, 0);
  ctx.lineTo(WIDTH, 260);
  ctx.lineTo(1080, 190);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, 620);
  ctx.lineTo(210, HEIGHT);
  ctx.lineTo(0, HEIGHT);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  panel(ctx, 20, 20, WIDTH - 40, HEIGHT - 40, 28);

  roundedRect(ctx, 20, 20, WIDTH - 40, 10, 5);
  ctx.fillStyle = gradient(ctx, 20, 20, WIDTH - 40, 10);
  ctx.fill();

  // MF Bot logo.
  const logoSize = 92;
  const logoX = 54;
  const logoY = 42;

  ctx.save();
  ctx.beginPath();
  ctx.arc(
    logoX + logoSize / 2,
    logoY + logoSize / 2,
    logoSize / 2 + 5,
    0,
    Math.PI * 2
  );
  ctx.fillStyle = '#10294a';
  ctx.fill();
  ctx.strokeStyle = C.cyan;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(
    logoX + logoSize / 2,
    logoY + logoSize / 2,
    logoSize / 2,
    0,
    Math.PI * 2
  );
  ctx.clip();

  try {
    const logo = await loadImage(botIconUrl || avatarUrl);
    ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
  } catch {
    ctx.fillStyle = C.panel2;
    ctx.fillRect(logoX, logoY, logoSize, logoSize);
    ctx.fillStyle = C.white;
    ctx.font = '800 34px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('MF', logoX + logoSize / 2, logoY + 57);
  }

  ctx.restore();

  ctx.textAlign = 'left';
  ctx.fillStyle = C.white;
  ctx.font = '800 37px Arial';
  ctx.fillText('MF BOT', 168, 78);

  ctx.fillStyle = C.cyan;
  ctx.font = '700 19px Arial';
  ctx.fillText('Q U E S T   B O A R D', 170, 110);

  ctx.textAlign = 'right';
  ctx.fillStyle = C.muted;
  ctx.font = '700 15px Arial';
  ctx.fillText('CHAT  /  EARN  /  LEVEL UP', WIDTH - 58, 82);

  // Member summary panel.
  panel(ctx, 48, 150, WIDTH - 96, 174, 22);

  const avatarSize = 112;
  const avatarX = 72;
  const avatarY = 181;

  ctx.save();
  ctx.beginPath();
  ctx.arc(
    avatarX + avatarSize / 2,
    avatarY + avatarSize / 2,
    avatarSize / 2 + 6,
    0,
    Math.PI * 2
  );
  ctx.fillStyle = '#10294a';
  ctx.fill();
  ctx.strokeStyle = C.cyan;
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(
    avatarX + avatarSize / 2,
    avatarY + avatarSize / 2,
    avatarSize / 2,
    0,
    Math.PI * 2
  );
  ctx.clip();

  try {
    const avatar = await loadImage(avatarUrl);
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
  } catch {
    ctx.fillStyle = C.panel2;
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
  }

  ctx.restore();

  const safeName = String(username || 'Member');

  ctx.textAlign = 'left';
  ctx.fillStyle = C.muted;
  ctx.font = '700 15px Arial';
  ctx.fillText('QUEST PROGRESS FOR', 220, 194);

  ctx.fillStyle = C.white;
  ctx.font = `800 ${fitText(ctx, safeName, 440, 31)}px Arial`;
  ctx.fillText(safeName, 220, 235);

  const completed = quests.filter((quest) => quest.completed).length;
  const claimed = quests.filter((quest) => quest.claimed).length;

  const xpReady = quests
    .filter((quest) => quest.completed && !quest.claimed)
    .reduce((sum, quest) => sum + quest.rewardXp, 0);

  const stats = [
    { label: 'COMPLETED', value: `${completed}/${quests.length}` },
    { label: 'CLAIMED', value: `${claimed}/${quests.length}` },
    { label: 'XP READY', value: xpReady.toLocaleString() },
  ];

  const statStartX = 710;
  const statWidth = 135;

  stats.forEach((stat, index) => {
    const x = statStartX + index * 145;

    if (index > 0) {
      ctx.strokeStyle = '#213b5b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 12, 190);
      ctx.lineTo(x - 12, 282);
      ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = C.cyan;
    ctx.font = '800 29px Arial';
    ctx.fillText(stat.value, x + statWidth / 2, 230);

    ctx.fillStyle = C.muted;
    ctx.font = '700 12px Arial';
    ctx.fillText(stat.label, x + statWidth / 2, 257);
  });

  // Daily and weekly quest cards.
  const cardX = 48;
  const cardWidth = WIDTH - 96;
  const cardHeight = 202;
  const gap = 20;
  const firstY = 348;

  quests.slice(0, 2).forEach((quest, index) => {
    const y = firstY + index * (cardHeight + gap);

    panel(ctx, cardX, y, cardWidth, cardHeight, 22);

    roundedRect(ctx, cardX, y, 9, cardHeight, 5);
    ctx.fillStyle = gradient(ctx, cardX, y, 9, cardHeight);
    ctx.fill();

    const isDaily = quest.type === 'daily';

    ctx.textAlign = 'left';
    ctx.fillStyle = C.cyan;
    ctx.font = '800 14px Arial';
    ctx.fillText(
      isDaily ? 'DAILY QUEST' : 'WEEKLY QUEST',
      82,
      y + 40
    );

    ctx.fillStyle = C.white;
    ctx.font = `800 ${fitText(ctx, quest.name, 650, 29)}px Arial`;
    ctx.fillText(quest.name, 82, y + 77);

    ctx.fillStyle = C.muted;
    ctx.font = '18px Arial';
    ctx.fillText(
      String(quest.description || 'Complete this quest to earn XP.').slice(0, 68),
      82,
      y + 108
    );

    const progress = Math.min(
      quest.target,
      Math.max(0, quest.progress)
    );

    const percentage = drawProgress(
      ctx,
      82,
      y + 142,
      515,
      15,
      progress,
      quest.target
    );

    ctx.fillStyle = C.white;
    ctx.font = '800 18px Arial';
    ctx.fillText(`${progress}/${quest.target}`, 615, y + 156);

    ctx.fillStyle = C.muted;
    ctx.font = '700 13px Arial';
    ctx.fillText(`${percentage}% COMPLETE`, 82, y + 181);

    // Reward panel.
    roundedRect(ctx, 790, y + 22, 318, cardHeight - 44, 18);
    ctx.fillStyle = '#091322';
    ctx.fill();
    ctx.strokeStyle = '#183d65';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.save();
    ctx.shadowColor = C.blue;
    ctx.shadowBlur = 14;

    ctx.beginPath();
    ctx.moveTo(830, y + 48);
    ctx.lineTo(854, y + 60);
    ctx.lineTo(854, y + 87);
    ctx.lineTo(830, y + 100);
    ctx.lineTo(806, y + 87);
    ctx.lineTo(806, y + 60);
    ctx.closePath();

    ctx.fillStyle = '#0c2e62';
    ctx.fill();
    ctx.strokeStyle = C.cyan;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.fillStyle = C.white;
    ctx.font = '800 15px Arial';
    ctx.fillText('XP', 830, y + 78);

    ctx.textAlign = 'left';
    ctx.fillStyle = C.muted;
    ctx.font = '700 13px Arial';
    ctx.fillText('REWARD', 872, y + 56);

    ctx.fillStyle = C.white;
    ctx.font = '800 29px Arial';
    ctx.fillText(`${quest.rewardXp} XP`, 872, y + 87);

    let status;
    let statusColor;

    if (quest.claimed) {
      status = 'REWARD CLAIMED';
      statusColor = C.green;
    } else if (quest.completed) {
      status = 'READY TO CLAIM';
      statusColor = C.cyan;
    } else {
      status = 'IN PROGRESS';
      statusColor = C.muted;
    }

    roundedRect(ctx, 812, y + 113, 274, 43, 12);

    ctx.fillStyle = quest.completed && !quest.claimed
      ? gradient(ctx, 812, y + 113, 274, 43)
      : '#101f34';

    ctx.fill();

    ctx.strokeStyle = statusColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = quest.completed && !quest.claimed
      ? '#ffffff'
      : statusColor;

    ctx.font = '800 13px Arial';
    ctx.fillText(status, 949, y + 139);
  });

  ctx.fillStyle = C.muted;
  ctx.font = '13px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(
    'DAILY RESET 00:00 UTC  •  WEEKLY RESET MONDAY 00:00 UTC',
    WIDTH / 2,
    HEIGHT - 37
  );

  return canvas.toBuffer('image/png');
}

module.exports = { makeQuestCard };
