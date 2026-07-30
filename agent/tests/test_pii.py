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
