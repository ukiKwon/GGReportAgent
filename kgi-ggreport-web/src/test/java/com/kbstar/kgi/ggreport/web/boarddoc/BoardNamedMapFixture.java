package com.kbstar.kgi.ggreport.web.boarddoc;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * 이름·구역 형식 시험용 지도(표 A·B·C-4, 구역 detail·judge). {@link BoardSourceFixture} 의 가상 시트 "수익성분석" 에 맞춘다.
 * 칸 값 = 행(0-기준)*100 + 열(0-기준): 세부 산출표의 총수익(A) 행 = r7, 계 열 = 10 → 710. 구분 열 A~D, 5년 열 = 9(큰 수).
 * 따옴표는 {@code '} 로 적고 읽을 때 {@code "} 로 바꾼다.
 */
final class BoardNamedMapFixture {

    private static final ObjectMapper JSON = new ObjectMapper();

    private static final String TEXT = "{'mapping_ver':2,'catalog_ver':2,'areas':{"
            + "'detail':{'sheet':['수익성분석'],'title':'2. 세부 산출표','until':'3. 투자*','header_has':['사업초기','계'],"
            + "'cols':{'init':'사업초기','y1':'1년','y2':'2년','y3':'3년','y4':'4년','tot':'계'},"
            + "'unit':'백만원','unit_assumed':false,'unit_in_title':true,"
            + "'rows':{'rev':{'path':['총수익(A)']},'cost':{'path':['총비용(B)']},'op':{'path':['영업이익(C)']},"
            + "'it':{'path':['인건비','본부부서 인건비'],'count':2}}},"
            + "'judge':{'sheet':['수익성분석'],'title':'3. 투자 및 출연금 적정성 검토','header_has':['회수기간법*','내부수익률법*'],"
            + "'cols':{'payback':'회수기간법*','npv':'순현재가치(NPV)','irr':'내부수익률법*'},"
            + "'unit':'백만원','unit_assumed':true,'rows':{'value':{'below':1}}}},"
            + "'tables':["
            + "{'ref':'A','lines':["
            + "{'row':1,'cells':[{'op':'eok','parts':['detail.rev'],'col':'tot'}]},"
            + "{'row':2,'cells':[{'op':'eok','parts':['detail.cost'],'col':'tot'}]},"
            + "{'row':3,'cells':[{'op':'eok','parts':['detail.it'],'col':'tot'}]},"
            + "{'row':4,'cells':[{'op':'derive_sum','of':['r1c2','r2c1','r3c1']}]}]},"
            + "{'ref':'B','lines':["
            + "{'row':1,'cells':[{'op':'eok','parts':['detail.rev'],'col':'tot'},{'op':'eok','parts':['detail.cost'],'col':'tot'},"
            + "{'op':'eok','parts':['detail.op'],'col':'tot'},"
            + "{'op':'paren','parts':['detail.rev'],'sub':['detail.cost'],'col':'tot'},"
            + "{'op':'eok','parts':['detail.rev'],'col':'tot'},{'op':'eok','parts':['detail.rev'],'col':'tot'},"
            + "{'op':'eok','parts':['detail.rev'],'col':'tot'}]},"
            + "{'row':2,'cells':[{'op':'eok','parts':['detail.rev','detail.cost'],'col':'tot'},"
            + "{'op':'eok','parts':['detail.cost'],'col':'tot'},{'op':'eok','parts':['detail.cost'],'col':'tot'},"
            + "{'op':'eok','parts':['detail.cost'],'col':'tot'},{'op':'eok','parts':['detail.cost'],'col':'tot'},"
            + "{'op':'eok','parts':['detail.cost'],'col':'tot'},{'op':'eok','parts':['detail.cost'],'col':'tot'}]}]},"
            + "{'ref':'C-4','lines':["
            + "{'row':1,'cells':[{'op':'plain','parts':['judge.value'],'col':'payback'}]},"
            + "{'row':2,'cells':[{'op':'eok','parts':['judge.value'],'col':'npv'}]},"
            + "{'row':3,'cells':[{'op':'plain','parts':['judge.value'],'col':'irr'}]}]}]}";

    private BoardNamedMapFixture() {
    }

    /** 매번 새로 읽은 가변 사본. */
    static ObjectNode root() {
        try {
            return (ObjectNode) JSON.readTree(TEXT.replace('\'', '"'));
        } catch (java.io.IOException e) {
            throw new AssertionError(e);
        }
    }

    static BoardExcelMap map() {
        return new BoardExcelMap(root());
    }

    static ObjectNode area(ObjectNode root, String id) {
        return (ObjectNode) root.get("areas").get(id);
    }

    static ObjectNode table(ObjectNode root, String ref) {
        for (JsonNode t : root.get("tables")) {
            if (ref.equals(t.get("ref").asText())) {
                return (ObjectNode) t;
            }
        }
        throw new AssertionError("table not found " + ref);
    }

    static ObjectNode line(ObjectNode root, String ref, int row) {
        for (JsonNode l : table(root, ref).get("lines")) {
            if (l.get("row").asInt() == row) {
                return (ObjectNode) l;
            }
        }
        throw new AssertionError("line not found " + ref + " " + row);
    }

    static ObjectNode cellSpec(ObjectNode root, String ref, int row, int i) {
        return (ObjectNode) line(root, ref, row).get("cells").get(i);
    }

    static ArrayNode tables(ObjectNode root) {
        return (ArrayNode) root.get("tables");
    }
}
