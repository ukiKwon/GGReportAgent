from agent.orchestrator.pii import scan_pii


def test_detects_mobile_phone():
    found = scan_pii("담당자 연락처는 010-1234-5678 입니다.")
    assert found == [{"kind": "휴대폰", "value": "010-****-5678"}]


def test_detects_rrn():
    found = scan_pii("주민번호 901231-1234567 기재")
    assert found[0]["kind"] == "주민등록번호"
    assert "1234567" not in found[0]["value"]  # 뒷자리 노출 금지


def test_detects_email():
    found = scan_pii("문의: kim.damdang@example.com")
    assert found[0]["kind"] == "이메일"
    assert found[0]["value"].startswith("k***@")


def test_clean_text_returns_empty():
    assert scan_pii("연락처 표기는 대표번호 02-120으로 통일한다.") == []


def test_no_double_detection_rrn_010101():
    """회귀: RRN 010101-*는 휴대폰으로 오분류되면 안 됨."""
    found = scan_pii("주민번호 010101-1234567 기재")
    assert len(found) == 1, f"Expected 1 item, got {len(found)}: {found}"
    assert found[0]["kind"] == "주민등록번호"
    # 뒷자리 원문 노출 금지
    assert "1234567" not in found[0]["value"]


def test_mobile_prefix_011_preserved():
    """회귀: 휴대폰 접두사 011은 010으로 하드코딩되면 안 됨."""
    found = scan_pii("연락처 011-1234-5678")
    assert len(found) == 1
    assert found[0]["kind"] == "휴대폰"
    assert found[0]["value"] == "011-****-5678", f"Expected '011-****-5678', got '{found[0]['value']}'"


def test_email_single_char_localpart():
    """엣지: 로컬파트 1자 ('k@example.com')는 안전하게 동작해야 함."""
    found = scan_pii("연락처: k@example.com")
    assert len(found) == 1
    assert found[0]["kind"] == "이메일"
    assert found[0]["value"] == "k***@example.com"
