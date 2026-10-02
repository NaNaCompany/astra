/*
 * 사내 포털 교육·시연용 가상 급여 데이터입니다.
 * 모든 직원과 금액은 예시이며 실제 인사·급여 자료가 아닙니다.
 * 공제액은 세법, 보험료율, 개인별 공제 조건을 반영하지 않는 가상 값입니다.
 * 연도와 산식이 고정되어 있어 페이지를 다시 열어도 같은 결과가 표시됩니다.
 * 이 파일을 일반 <script>로 불러오면 HR_PAYROLL 전역 변수를 사용할 수 있습니다.
 */
var HR_PAYROLL = (function () {
  "use strict";

  // 가상 이메일 ID는 작성 시 암호학적 난수로 한 번 생성한 고정값입니다.
  // 실제 메일함이나 발송 대상을 의미하지 않으며 모든 월에서 같은 주소를 사용합니다.
  var employees = [
    { employeeId: "EMP-001", name: "민정식", email: "n4o0qu3326@nanalab.kr", dept: "인사팀", rank: "차장", base: 6200000 },
    { employeeId: "EMP-002", name: "김서연", email: "gmz7g5ax@nanalab.kr", dept: "인사팀", rank: "과장", base: 4900000 },
    { employeeId: "EMP-003", name: "윤수빈", email: "19lut5web@nanalab.kr", dept: "인사팀", rank: "대리", base: 3800000 },
    { employeeId: "EMP-004", name: "임지훈", email: "kvq2532zr@nanalab.kr", dept: "인사팀", rank: "사원", base: 2900000 },
    { employeeId: "EMP-005", name: "홍민석", email: "dqhgjv8pq3@nanalab.kr", dept: "물류팀", rank: "대리", base: 3850000 },
    { employeeId: "EMP-006", name: "박소영", email: "g0ql7ofa@nanalab.kr", dept: "마케팅팀", rank: "부장", base: 7200000 },
    { employeeId: "EMP-007", name: "정다은", email: "btakp1w6@nanalab.kr", dept: "마케팅팀", rank: "과장", base: 5000000 },
    { employeeId: "EMP-008", name: "한지우", email: "a5qis4afe@nanalab.kr", dept: "마케팅팀", rank: "사원", base: 3000000 },
    { employeeId: "EMP-009", name: "최성호", email: "h6q9ooby@nanalab.kr", dept: "재무팀", rank: "부장", base: 7400000 },
    { employeeId: "EMP-010", name: "서혜진", email: "zcffusm7@nanalab.kr", dept: "재무팀", rank: "과장", base: 5100000 },
    { employeeId: "EMP-011", name: "오준혁", email: "ibry52d3t2@nanalab.kr", dept: "재무팀", rank: "대리", base: 4000000 },
    { employeeId: "EMP-012", name: "장예린", email: "00t88alx@nanalab.kr", dept: "재무팀", rank: "사원", base: 3100000 },
    { employeeId: "EMP-013", name: "이도현", email: "bbwdmku5j@nanalab.kr", dept: "개발팀", rank: "부장", base: 7900000 },
    { employeeId: "EMP-014", name: "백지은", email: "8p63p45kx@nanalab.kr", dept: "개발팀", rank: "차장", base: 6600000 },
    { employeeId: "EMP-015", name: "강태윤", email: "fac1p55ff@nanalab.kr", dept: "개발팀", rank: "과장", base: 5500000 },
    { employeeId: "EMP-016", name: "신유나", email: "8kqv7ukgog@nanalab.kr", dept: "개발팀", rank: "대리", base: 4300000 },
    { employeeId: "EMP-017", name: "유경민", email: "rq1no716@nanalab.kr", dept: "디자인팀", rank: "차장", base: 6000000 },
    { employeeId: "EMP-018", name: "안소희", email: "5te0d2qz3n@nanalab.kr", dept: "디자인팀", rank: "과장", base: 4800000 },
    { employeeId: "EMP-019", name: "전하린", email: "glqqnl4q@nanalab.kr", dept: "디자인팀", rank: "대리", base: 3900000 },
    { employeeId: "EMP-020", name: "문재원", email: "hex0zjp6@nanalab.kr", dept: "디자인팀", rank: "사원", base: 3050000 },
    { employeeId: "EMP-021", name: "조현우", email: "sb17f7y5@nanalab.kr", dept: "영업팀", rank: "부장", base: 7500000 },
    { employeeId: "EMP-022", name: "송미정", email: "wt0bp3t3sx@nanalab.kr", dept: "영업팀", rank: "차장", base: 6100000 },
    { employeeId: "EMP-023", name: "배승준", email: "94j46m9h8w@nanalab.kr", dept: "영업팀", rank: "과장", base: 4950000 },
    { employeeId: "EMP-024", name: "차은서", email: "ib2qa4xfk@nanalab.kr", dept: "영업팀", rank: "대리", base: 3950000 },
    { employeeId: "EMP-025", name: "남기훈", email: "ddkynlp64@nanalab.kr", dept: "물류팀", rank: "차장", base: 5800000 },
    { employeeId: "EMP-026", name: "권수정", email: "2ktjsw07v8@nanalab.kr", dept: "물류팀", rank: "과장", base: 4700000 },
    { employeeId: "EMP-027", name: "노시원", email: "ykfy697fe@nanalab.kr", dept: "물류팀", rank: "대리", base: 3750000 },
    { employeeId: "EMP-028", name: "황도윤", email: "8h1pj0x32@nanalab.kr", dept: "물류팀", rank: "사원", base: 2950000 },
    { employeeId: "EMP-029", name: "양세진", email: "uiu9q6rj4@nanalab.kr", dept: "고객지원팀", rank: "차장", base: 5700000 },
    { employeeId: "EMP-030", name: "하유진", email: "3kg3f61da@nanalab.kr", dept: "고객지원팀", rank: "과장", base: 4600000 },
    { employeeId: "EMP-031", name: "정우빈", email: "x330ylo3x2@nanalab.kr", dept: "고객지원팀", rank: "대리", base: 3650000 },
    { employeeId: "EMP-032", name: "김나경", email: "r3ekk88q@nanalab.kr", dept: "고객지원팀", rank: "사원", base: 2850000 }
  ];

  var months = [];

  for (var month = 1; month <= 12; month += 1) {
    var rows = employees.map(function (employee, employeeIndex) {
      // 월 번호와 직원 순번만 사용하는 결정적 가상 수당 산식입니다.
      var ot = 90000 + ((employeeIndex * 7 + month * 5) % 19) * 18000;
      var meal = 200000;
      var bonus = 80000 + ((employeeIndex * 3 + month * 2) % 9) * 20000;

      // 2·9월 명절 상여, 6·12월 반기 상여를 가정한 교육용 예시입니다.
      if (month === 2 || month === 9) {
        bonus += Math.round(employee.base * 0.2);
      }
      if (month === 6 || month === 12) {
        bonus += Math.round(employee.base * 0.35);
      }

      var gross = employee.base + ot + meal + bonus;

      // 실제 원천징수·사회보험 계산이 아닙니다. 가상 공제율과 가상 고정액입니다.
      var fictionalDeductionPercent = 12 + (employeeIndex % 4);
      var ded = Math.round(gross * fictionalDeductionPercent / 100000) * 1000;
      ded += 10000 + (employeeIndex % 3) * 5000;

      return {
        employeeId: employee.employeeId,
        name: employee.name,
        email: employee.email,
        dept: employee.dept,
        rank: employee.rank,
        base: employee.base,
        ot: ot,
        meal: meal,
        bonus: bonus,
        gross: gross,
        ded: ded,
        net: gross - ded
      };
    });

    months.push({ month: month, rows: rows });
  }

  return { year: 2026, employees: employees, months: months };
}());
