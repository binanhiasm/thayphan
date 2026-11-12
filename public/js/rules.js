// Luật của thầy: kho câu phán, phân loại câu hỏi, và các câu thầy KHÔNG phán.
// File này chạy được cả trên trình duyệt lẫn server (không đụng DOM).

export const BANK = {
  work: ["Nghỉ đi. Ở lại vì sợ thì không gọi là trung thành.", "Ở thêm ba tháng. Đủ tiền thì lòng mới đủ gan.", "Câu này con hỏi lần thứ mấy rồi? Đơn viết sẵn chưa?", "Đừng nghỉ vì sếp. Sếp thì đầy, con thì chỉ một.", "Nghỉ được. Nhưng học cho hết cái con cần học đã.", "Công việc không có lỗi. Lỗi là con đã lớn hơn nó.", "Viết đơn sẵn, cất ngăn kéo. Bảy ngày sau còn muốn thì nộp.", "Xin nghỉ đi. Một ngày nghỉ không làm sập công ty."],
  love: ["Nhắn đi. Quê một phút, tiếc một năm.", "Nhắn \"ăn cơm chưa\" thôi. Đừng gửi cả trái tim một lần.", "Người ta seen mà không rep, là đã rep rồi đó con.", "Đừng nhắn lúc nửa đêm. Nỗi nhớ giờ đó hay nói dối.", "Tỏ tình đi. Bị từ chối cũng là một câu trả lời rõ ràng.", "Thương thì nói. Đoán ý nhau mệt lắm, cho cả hai.", "Đợi người ta nhắn trước một lần. Tình cảm cũng cần chia việc."],
  money: ["Mua đi. Nhưng mua vì thích, đừng mua vì buồn.", "Bỏ giỏ ba ngày. Còn thương thì cưới.", "Không. Cái con cần là ngủ đủ, không phải đồ mới.", "Mua. Tháng này nhịn trà sữa bù lại.", "Ví con không đau bằng cái tủ đồ đang chật.", "Đầu tư vào bản thân trước. Cái áo đợi lương về.", "Thứ con thật cần, con đâu có phải hỏi thầy."],
  boss: ["Nói đi. Nói nhẹ, nhưng nói cho hết.", "Đừng cãi. Hãy hỏi. Câu hỏi đúng làm sếp tự cãi mình.", "Mang số liệu theo. Cảm xúc không thắng nổi Excel.", "Hôm nay không. Đang giận thì miệng nhanh hơn não.", "Sếp cũng là người sợ sai. Nói như nói với người.", "Hẹn riêng. Giữa cuộc họp thì ai cũng phải giữ thể diện."],
  food: ["Phở bò tái. Nước trong, lòng nhẹ.", "Cơm tấm sườn. Con nghĩ nhiều, phải ăn cho chắc bụng.", "Bún bò cay. Đổ mồ hôi chút cho nhớ mình còn sống.", "Canh chua cá lóc. Đời đủ đắng rồi, ăn chua cho cân.", "Hủ tiếu. Ăn chậm thôi, deadline không chạy mất đâu.", "Món hôm qua con ăn. Con đâu thích bất ngờ, đừng giả vờ.", "Gỏi cuốn. Cuốn chặt như cách con giữ chuyện trong lòng.", "Bún chả. Nướng thịt thôi, đừng nướng luôn bản thân.", "Mì Quảng. Hôm nay con cần đổi gió, kể cả trong tô.", "Cơm nhà. Ai nấu thì cảm ơn người đó một câu.", "Bánh mì. Con lại bận như mọi trưa, thầy biết mà.", "Bún riêu. Chua chua cay cay, đúng vị hôm nay của con."],
  drink: ["Cà phê sữa đá. Tỉnh để làm, đừng tỉnh để lo.", "Trà đá. Rẻ, mát, không ai phán xét con.", "Trà sữa ít đường. Ngọt vừa thôi, như cách con thương người ta.", "Nước lọc. Cơ thể con xin từ sáng, chỉ là con không nghe.", "Bạc xỉu. Nửa tỉnh nửa mơ, đúng chất buổi trưa.", "Nước mía. Ngọt mát, không cần lý do.", "Trà nóng. Uống chậm thì chuyện gì cũng nguội bớt.", "Sinh tố bơ. Hôm nay con xứng đáng được chiều.", "Cà phê đen không đường. Đời đắng sẵn rồi, tập quen dần.", "Nước dừa. Mát ruột, mát luôn cái đầu đang nóng.", "Trà chanh. Ngồi vỉa hè một lúc, chuyện gì cũng nhẹ.", "Cà phê muối. Mặn một chút mới thấy ngọt."],
  wear: ["Áo trắng quần tối. Không đẹp nhất, nhưng không bao giờ sai.", "Mặc bộ con thấy thoải mái. Tự tin là món đồ hiệu rẻ nhất.", "Cái váy con tiếc chưa mặc. Đợi dịp thì dịp không tới.", "Đồ đen. Không ai hỏi, không ai chê, con được yên.", "Mặc cho mình. Người ta nhìn con có ba giây thôi.", "Áo sơ mi. Hôm nay con cần trông như người có kế hoạch.", "Mặc cái áo màu sáng nhất tủ. Trời không vui thì con vui."],
  go: ["Về thăm mẹ. Chỗ đó không cần đặt bàn.", "Ra quán cà phê ngồi một mình. Lâu rồi con chưa gặp con.", "Ở nhà dọn cái góc con né cả tháng nay.", "Đi bộ quanh nhà. Không cần đi xa mới thấy mới.", "Đi chỗ chưa đi bao giờ. Gần thôi cũng tính.", "Rủ đứa bạn lâu không gặp. Nó cũng đang chờ con nhắn."],
  open: ["Cái đầu tiên con nghĩ tới khi đọc câu này. Chính nó.", "Cái con sợ hơn. Thường đó là cái đúng.", "Cái rẻ hơn. Phần dư dùng mua bình yên.", "Cái con chưa thử. Quen quá thì đời nhạt.", "Cái mà mười năm sau con kể lại không ngại."],
  any: ["Con làm đi. Sai thầy chịu, đúng con hưởng.", "Con biết câu trả lời rồi. Con chỉ cần người ký tên.", "Làm. Nhưng đừng kể ai trước khi xong.", "Hôm nay không. Mai thì được.", "Trả lời là CÓ. Con chỉ chưa dám nói thành tiếng.", "Uống trà đã. Quyết lúc nước còn sôi là bỏng.", "Con sợ là đúng. Can đảm là sợ mà vẫn làm.", "Việc nhỏ. Con đang lo giùm cả tương lai rồi đó.", "Còn phải hỏi thầy là chưa tới lúc.", "Làm nửa thôi. Nửa còn lại để dành sáng mai.", "Hỏi mẹ trước. Mẹ gật là trời gật.", "Không. Không là không, đừng xin xỏ.", "Ngủ một giấc. Câu trả lời hay tới lúc đánh răng.", "Làm đi. Mười năm nữa con chỉ tiếc cái chưa làm."],
  // Câu chưa xếp được loại: thầy vẫn dứt khoát nhưng không xúi làm liều.
  soft: ["Ngủ một giấc. Câu trả lời hay tới lúc đánh răng.", "Hỏi mẹ trước. Mẹ gật là trời gật.", "Uống trà đã. Quyết lúc nước còn sôi là bỏng.", "Con biết câu trả lời rồi. Con chỉ cần người ký tên.", "Còn phải hỏi thầy là chưa tới lúc.", "Viết ra giấy hai cột được mất. Cột nào dài hơn, theo cột đó."]
};

export const CLOSERS = ["Thỉnh nữa là thầy tính tiền trà nha con.", "Thầy phán hết rồi. Con hỏi mãi là vì con đã chọn xong trong lòng.", "Đủ rồi con. Câu thầy phán đầu tiên là câu đúng.", "Con thỉnh nhiều quá. Câu nào làm con nhẹ người nhất, làm theo câu đó."];

// Ví dụ giọng thầy cho AI học theo.
export const VOICE = ["Phở bò tái. Nước trong, lòng nhẹ.", "Cà phê sữa đá. Tỉnh để làm, đừng tỉnh để lo.", "Người ta seen mà không rep, là đã rep rồi đó con.", "Bỏ giỏ ba ngày. Còn thương thì cưới.", "Mang số liệu theo. Cảm xúc không thắng nổi Excel.", "Đừng nghỉ vì sếp. Sếp thì đầy, con thì chỉ một.", "Cà phê. Cái còn lại để dành cho ngày buồn.", "Con sợ là đúng. Can đảm là sợ mà vẫn làm."];

// Ranh giới chữ có dấu tiếng Việt (\b của JS chỉ hiểu chữ không dấu).
const W = (src) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${src})(?![\\p{L}\\p{N}])`, "iu");

export const RULES = [
  ["drink", W("uống gì|uống chi|uống nước gì|uống món|đồ uống|nước gì|khát|gọi nước")],
  ["food", W("ăn gì|ăn chi|ăn trưa|ăn tối|ăn sáng|ăn khuya|bữa trưa|bữa tối|đói|món gì|ăn món")],
  ["wear", W("mặc gì|mặc đồ|mặc áo|mặc váy|đồ gì")],
  ["go", W("đi đâu|chơi đâu|cuối tuần làm gì")],
  ["work", W("nghỉ việc|nghỉ làm|công ty|nhảy việc|thôi việc|xin việc|đổi việc|offer|đi làm|xin nghỉ")],
  ["love", W("crush|tỏ tình|nhắn|người yêu|người ấy|chia tay|quay lại|hẹn hò|cưới|ny|người cũ")],
  ["money", W("mua|tiền|chốt đơn|sale|giỏ hàng")],
  ["boss", W("sếp|cãi|góp ý|tăng lương|nghỉ phép")]
];

// ---- Những câu thầy không phán bừa ----
export const HOTLINE = { name: "Đường dây nóng Ngày Mai (hỗ trợ tâm lý)", number: "096 306 1414", tel: "0963061414" };
export const CARE = W("tự tử|tự sát|muốn chết|chán sống|không muốn sống|không thiết sống|sống không nổi|muốn biến mất|biến mất khỏi đời|tự làm đau|tự hại|rạch tay|cắt tay|kết thúc cuộc đời|kết liễu|nhảy cầu|nhảy lầu|uống thuốc ngủ|không ai cần mình");
export const CARE_LINE = "Câu này thầy không phán. Con gọi cho một người con thương ngay bây giờ nhé.";

export const SENSITIVE = [
  ["harm", W("đánh (?:người|nó|hắn|nhau|vợ|chồng|con|bạn|thằng|con nhỏ)|trả thù|đâm (?:người|nó|hắn)|chém (?:người|nó|hắn)|giết (?:người|nó|hắn)|hành hung|bỏ thuốc"),
    "Không. Nóng thì uống ngụm trà, đừng ra tay. Làm người khác đau thì thầy không chịu giùm."],
  ["med", W("bệnh|thuốc|kháng sinh|sốt|ho|đau bụng|đau đầu|đau ngực|đi khám(?!\\s*phá)|khám bệnh|bác sĩ|bệnh viện|uống thuốc|tiêm|vắc xin|có bầu|mang thai|phá thai|ung thư|trầm cảm|tiểu đường|huyết áp|dị ứng"),
    "Câu này hỏi bác sĩ, đừng hỏi thầy. Thầy chỉ giỏi pha trà."],
  ["legal", W("kiện|luật sư|pháp luật|công an|ra tòa|hầu tòa|ly hôn|đi tù|ngồi tù|di chúc|tranh chấp"),
    "Chuyện pháp luật thì hỏi luật sư. Thầy phán sai, con chịu thật."],
  ["bigmoney", W("vay|nợ|tỷ|\\d{2,}\\s*triệu|chứng khoán|cổ phiếu|coin|crypto|tiền ảo|bất động sản|mua nhà|mua đất|thế chấp|cầm cố|cho vay|góp vốn|đa cấp"),
    "Tiền lớn thì ngồi với người nhà mà tính. Khoản này thầy không ký giùm."]
];

/** Trả về {kind, line} nếu thầy không được phán bừa câu này, ngược lại null. */
export function safety(q) {
  if (CARE.test(q)) return { kind: "care", line: CARE_LINE };
  for (const [kind, re, line] of SENSITIVE) if (re.test(q)) return { kind, line };
  return null;
}

export const normKey = (q) => q.toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();

const PREFIX = /^(?:thầy ơi|thưa thầy|thầy|con nên|con muốn hỏi|con hỏi|cho con hỏi|có nên|nên chọn(?: ai| cái nào| gì)?|chọn(?: ai| cái nào)?|nên|con)[\s,:]+/iu;

/** "A hay B" -> thầy chọn hẳn một bên, dùng lại chữ của con. */
export function choice(q) {
  let s = q.normalize("NFC").replace(/[?？!.…]+$/u, "").trim();
  for (let prev = ""; prev !== s;) { prev = s; s = s.replace(PREFIX, "").trim(); }
  let parts = s.split(/\s+hay là\s+|\s+hay\s+|\s+hoặc là\s+|\s+hoặc\s+/iu)
    .map((p) => p.replace(/[\s,]*(?:không|ạ|nhỉ|đây|thầy|vậy|nữa)$/iu, "").trim())
    .filter(Boolean);
  if (parts.length < 2 || parts.some((p) => p.length > 40)) return null;
  // Chữ hoa đầu câu chỉ là do đứng đầu câu: nếu lựa chọn sau viết thường thì hạ lựa chọn đầu.
  if (/^\p{Ll}/u.test(parts[1])) parts[0] = parts[0].charAt(0).toLowerCase() + parts[0].slice(1);
  const cap = (p) => p.charAt(0).toUpperCase() + p.slice(1);
  // Lựa chọn một chữ ngắn ("đi", "ở") mà ghép "Chọn đi" thì đọc thành "chọn đi con", nên bỏ mẫu đó.
  return parts.flatMap((p) => [`${cap(p)}. Sai thầy chịu.`, ...(p.length > 3 ? [`Chọn ${p}. Cái kia là con đang tự làm khó mình.`] : [`${cap(p)}. Cái kia là con đang tự làm khó mình.`]), `${cap(p)}. Con biết từ lúc gõ chữ đầu tiên rồi.`, `${cap(p)}. Cái còn lại để dành cho ngày buồn.`]);
}

export function categoryOf(q) {
  for (const [k, re] of RULES) if (re.test(q)) return k;
  return null;
}

export function poolFor(q) {
  const c = choice(q);
  if (c) return c;
  const k = categoryOf(q);
  if (k) return BANK[k].concat(["food", "drink", "wear", "go"].includes(k) ? [] : BANK.any.slice(0, 4));
  if (W("gì|đâu|nào|mấy|ai|sao").test(q)) return BANK.open.concat(BANK.soft.slice(0, 2));
  // Câu có/không chưa rõ loại: một nửa dứt khoát, một nửa khôn ngoan.
  return BANK.any.slice(0, 7).concat(BANK.soft);
}

const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const rnd = (a) => a[Math.floor(Math.random() * a.length)];

/** Mỗi câu hỏi có một "ống quẻ" riêng: rút không lặp tới khi hết, hết thì thầy chốt rồi xào lại. */
export function makePicker() {
  const decks = {};
  return function pick(q, last) {
    const key = normKey(q);
    let d = decks[key];
    if (!d || !d.left.length) {
      if (d && !d.closed) { d.closed = true; return rnd(CLOSERS); }
      d = decks[key] = { left: shuffle(poolFor(q)), closed: false };
      if (d.left.length > 1 && d.left[d.left.length - 1] === last) d.left.unshift(d.left.pop());
    }
    return d.left.pop();
  };
}

export const isCloser = (v) => CLOSERS.includes(v);
