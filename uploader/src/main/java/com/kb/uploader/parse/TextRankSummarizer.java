package com.kb.uploader.parse;

import org.apache.lucene.analysis.ko.KoreanTokenizer;
import org.apache.lucene.analysis.ko.POS;
import org.apache.lucene.analysis.ko.tokenattributes.PartOfSpeechAttribute;
import org.apache.lucene.analysis.tokenattributes.CharTermAttribute;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 추출 요약: 문장마다 명사(Lucene Nori 형태소 분석)를 뽑고,
 * 공통 명사 기반 유사도 그래프에 PageRank를 돌려 중요 문장을 고른다 (TextRank, Mihalcea & Tarau 2004).
 */
@Component
public class TextRankSummarizer {

    private static final int MAX_SENTENCES = 1500;
    private static final int MIN_LEN = 12;
    private static final int MAX_LEN = 300;
    private static final double DAMPING = 0.85;
    private static final int ITERATIONS = 30;

    /** 텍스트를 문장 단위로 나눈다 (줄바꿈, "다." 및 마침표 기준). */
    public List<String> splitSentences(List<String> lines) {
        Set<String> out = new LinkedHashSet<>();
        for (String line : lines) {
            for (String s : line.split("(?<=[.!?。])\\s+|(?<=다\\.)")) {
                String t = s.replaceAll("^[\\s\\-·•○●□■◎▶▷※*]+", "").trim();
                if (t.length() >= MIN_LEN && t.length() <= MAX_LEN && t.contains(" ")) out.add(t);
            }
        }
        return new ArrayList<>(out);
    }

    /** 상위 topN 문장을 원문 순서대로 반환한다. */
    public List<String> summarize(List<String> sentences, int topN) {
        if (sentences.size() > MAX_SENTENCES) sentences = sentences.subList(0, MAX_SENTENCES);
        int n = sentences.size();
        if (n <= topN) return new ArrayList<>(sentences);

        List<Set<String>> tokens = new ArrayList<>(n);
        for (String s : sentences) tokens.add(nouns(s));

        double[][] w = new double[n][n];
        double[] outSum = new double[n];
        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                double sim = similarity(tokens.get(i), tokens.get(j));
                w[i][j] = sim;
                w[j][i] = sim;
                outSum[i] += sim;
                outSum[j] += sim;
            }
        }

        double[] score = new double[n];
        java.util.Arrays.fill(score, 1.0);
        for (int it = 0; it < ITERATIONS; it++) {
            double[] next = new double[n];
            for (int i = 0; i < n; i++) {
                double sum = 0;
                for (int j = 0; j < n; j++) {
                    if (w[j][i] > 0 && outSum[j] > 0) sum += w[j][i] / outSum[j] * score[j];
                }
                next[i] = (1 - DAMPING) + DAMPING * sum;
            }
            score = next;
        }

        List<Integer> idx = new ArrayList<>();
        for (int i = 0; i < n; i++) idx.add(i);
        final double[] s = score;
        idx.sort((a, b) -> Double.compare(s[b], s[a]));
        List<Integer> top = new ArrayList<>(idx.subList(0, topN));
        Collections.sort(top);

        List<String> result = new ArrayList<>();
        for (int i : top) result.add(sentences.get(i));
        return result;
    }

    private static double similarity(Set<String> a, Set<String> b) {
        if (a.isEmpty() || b.isEmpty()) return 0;
        int common = 0;
        for (String t : a) if (b.contains(t)) common++;
        if (common == 0) return 0;
        return common / (Math.log(a.size() + 1) + Math.log(b.size() + 1));
    }

    /** 일반명사·고유명사·외국어(영문) 토큰, 2글자 이상. */
    public Set<String> nouns(String text) {
        Set<String> result = new HashSet<>();
        try (KoreanTokenizer tokenizer = new KoreanTokenizer()) {
            CharTermAttribute term = tokenizer.addAttribute(CharTermAttribute.class);
            PartOfSpeechAttribute pos = tokenizer.addAttribute(PartOfSpeechAttribute.class);
            tokenizer.setReader(new StringReader(text));
            tokenizer.reset();
            while (tokenizer.incrementToken()) {
                POS.Tag tag = pos.getLeftPOS();
                if ((tag == POS.Tag.NNG || tag == POS.Tag.NNP || tag == POS.Tag.SL) && term.length() >= 2) {
                    result.add(term.toString().toLowerCase());
                }
            }
            tokenizer.end();
        } catch (IOException e) {
            throw new IllegalStateException("형태소 분석 실패", e);
        }
        return result;
    }
}
