

# ── M-1: 아카이브 뿌리가 두 벌이던 문제 ─────────────────────────────────

def test_build_run_input이_앱의_아카이브_뿌리를_그대로_넘긴다():
    """예전에는 여기서 `"report_archive"`를 박아 뒀는데 실제 뿌리는
    `data/report_archive`(데모는 `data/demo_report_archive`)라, 이전 회차 제안서를
    찾는 institution_match_node가 **늘 빈 폴더를 봤다.** 예외가 안 나서
    "이전 제안서 없음"과 구별되지 않던 종류의 조용한 오작동이다."""
    from backend.models import Institution
    from backend.orchestrator_service import OrchestratorService

    inst = Institution(institution_id="nowon", name_ko="노원구", stage=1)
    run_input = OrchestratorService.build_run_input(
        inst, "data/demo_report_new", "data/demo_report_archive")
    assert run_input["archive_dir"] == "data/demo_report_archive"


def test_build_run_input_기본값도_접두사가_붙어_있다():
    from agent.paths import DEFAULT_ARCHIVE_ROOT
    from backend.models import Institution
    from backend.orchestrator_service import OrchestratorService

    inst = Institution(institution_id="nowon", name_ko="노원구", stage=1)
    assert OrchestratorService.build_run_input(inst, "out")["archive_dir"] == DEFAULT_ARCHIVE_ROOT
    assert DEFAULT_ARCHIVE_ROOT == "data/report_archive"
