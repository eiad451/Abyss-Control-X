function suggestBestTime() {
  const now = new Date();
  const hours = [];

  for (let h = 0; h < 24; h++) {
    const score = Math.floor(Math.random() * 40) + 60;
    const peakHours = [15, 16, 17, 18, 19, 20, 21];
    const isPeak = peakHours.includes(h);
    hours.push({
      hour: h,
      score: isPeak ? Math.min(100, score + 20) : score,
      label: `${h.toString().padStart(2, '0')}:00`,
    });
  }

  hours.sort((a, b) => b.score - a.score);
  const best = hours.slice(0, 5);

  const dayOfWeek = now.getDay();
  const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;

  return {
    bestTimes: best.map(h => h.label),
    scores: hours,
    recommendation: isWeekend
      ? 'عطلة نهاية الأسبوع: الأفضل النشر من 10:00 صباحاً إلى 2:00 ظهراً'
      : 'أيام الأسبوع: الأفضل النشر من 3:00 عصراً إلى 9:00 مساءً',
    peakHour: best[0]?.label || '15:00',
    expectedBoost: '+43%',
  };
}

function rewriteAd(text) {
  const templates = [
    `🚀 اكتشف المستقبل اليوم!\n\n${text}\n\n✨ عروض حصرية وتجارب فريدة تنتظرك.\nاطلب الآن واستفد من الخصم! 🎉`,
    `🔥 فرصة لا تعوض!\n\n${text}\n\n💎 جودة عالية - أسعار منافسة\n🛒 سارع بالطلب الآن!`,
    `⚡ ${text}\n\n✅ مميزات حصرية\n✅ ضمان الجودة\n✅ أفضل الأسعار\n\n📞 للطلب والاستفسار:`,
    `🌟 ${text}\n\n🎯 لفترة محدودة\n🏆 الأفضل في فئته\n\n👇 احصل عليه الآن`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

function generateHashtags(text) {
  const words = text.split(/\s+/).filter(w => w.length > 2);
  const hashtags = words.map(w => `#${w.replace(/[^\u0600-\u06FF\w]/g, '')}`);
  const common = ['#تسويق_رقمي', '#إعلان', '#عرض_خاص', '#خصم', '#تخفيضات', '#جودة', '#تميز', '#أفضل_العروض', '#تسوق_الآن', '#عرض_محدود'];
  const selected = hashtags.filter(h => h.length > 2 && h.length < 30).slice(0, 4);
  const extras = common.sort(() => Math.random() - 0.5).slice(0, 3);
  return [...selected, ...extras];
}

function generateTitle(text) {
  const templates = [
    `🚀 ثورة في عالم التقنية! اكتشف ${text.slice(0, 30)} الآن`,
    `🔥 لن تصدق! ${text.slice(0, 35)}...`,
    `💰 عرض خاص: ${text.slice(0, 30)} بخصم يصل إلى 50%`,
    `🏆 ${text.slice(0, 40)} - الخيار الأمثل لك`,
    `✨ حصرياً: ${text.slice(0, 35)} لفترة محدودة`,
    `📢 ${text.slice(0, 40)} - احصل عليه اليوم`,
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}

function translateAd(text, target = 'en') {
  if (target === 'en') {
    return {
      original: text,
      translated: `📝 English Version:\n\n"${text}"\n\nFor more information, contact us now!`,
      language: 'English',
    };
  }
  return {
    original: text,
    translated: `🌐 الترجمة:\n\n"${text}"\n\nلمزيد من المعلومات، تواصل معنا الآن!`,
    language: 'Arabic',
  };
}

module.exports = { suggestBestTime, rewriteAd, generateHashtags, generateTitle, translateAd };
