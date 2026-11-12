import { test } from "node:test";
import assert from "node:assert/strict";
import { safety, choice, categoryOf, poolFor, makePicker, isCloser, BANK } from "../public/js/rules.js";

test("câu khủng hoảng được bắt, kể cả cách nói vòng", () => {
  for (const q of ["Con muốn chết", "con buồn quá muốn biến mất", "con chán sống lắm thầy", "không thiết sống nữa"]) {
    assert.equal(safety(q)?.kind, "care", q);
  }
});

test("không bắt nhầm câu bình thường", () => {
  for (const q of ["Có nên giết thời gian bằng game không?", "Có nên đi khám phá Đà Lạt không?", "Có nên đâm đầu vào yêu không?", "Hôm nay có nên đánh răng trước khi ăn sáng?", "Trà sữa hay cà phê?"]) {
    assert.equal(safety(q), null, q);
  }
});

test("câu y tế, pháp luật, tiền lớn, bạo lực không bị phán bừa", () => {
  assert.equal(safety("Con bị sốt có nên uống kháng sinh không?")?.kind, "med");
  assert.equal(safety("Có nên vay 500 triệu mua nhà không?")?.kind, "bigmoney");
  assert.equal(safety("Có nên kiện công ty cũ không?")?.kind, "legal");
  assert.equal(safety("Có nên đánh nó không?")?.kind, "harm");
});

test("A hay B: bỏ hết cụm mở đầu và giữ chữ thường", () => {
  assert.equal(choice("Thầy ơi con nên đi hay ở?")[0], "Đi. Sai thầy chịu.");
  assert.equal(choice("Nên chọn ai: Minh hay Tuấn?")[0], "Minh. Sai thầy chịu.");
  assert.ok(choice("Trà sữa hay cà phê?").includes("Chọn trà sữa. Cái kia là con đang tự làm khó mình."));
  assert.equal(choice("Có nên nghỉ việc không?"), null);
});

test("phân loại câu hỏi", () => {
  assert.equal(categoryOf("Có nên xin nghỉ hôm nay không?"), "work");
  assert.equal(categoryOf("Con nên làm gì bây giờ?"), null);
  assert.ok(poolFor("Con nên làm gì bây giờ?").includes(BANK.open[0]));
  assert.ok(!Object.values(BANK).flat().some((v) => v.startsWith("Ăn gì cũng được")));
});

test("ống quẻ không lặp và có câu chốt", () => {
  const pick = makePicker(), q = "Trà sữa hay cà phê?", n = poolFor(q).length, got = [];
  for (let i = 0; i < n; i++) got.push(pick(q));
  assert.equal(new Set(got).size, n);
  assert.ok(isCloser(pick(q)));
});
