package com.kb.uploader.parse;

import org.apache.poi.sl.usermodel.GroupShape;
import org.apache.poi.sl.usermodel.PictureShape;
import org.apache.poi.sl.usermodel.Shape;
import org.apache.poi.sl.usermodel.Slide;
import org.apache.poi.sl.usermodel.SlideShow;
import org.apache.poi.sl.usermodel.SlideShowFactory;
import org.apache.poi.sl.usermodel.TableCell;
import org.apache.poi.sl.usermodel.TableShape;
import org.apache.poi.sl.usermodel.TextShape;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/** ppt(HSLF)·pptx(XSLF) 슬라이드별 제목·본문·이미지 여부 추출. */
@Component
public class PptExtractor {

    public List<SlideContent> extract(Path file) throws IOException {
        try (InputStream in = Files.newInputStream(file);
             SlideShow<?, ?> show = SlideShowFactory.create(in)) {
            List<SlideContent> result = new ArrayList<>();
            int index = 1;
            for (Slide<?, ?> slide : show.getSlides()) {
                List<String> texts = new ArrayList<>();
                boolean[] hasImage = {false};
                for (Shape<?, ?> shape : slide.getShapes()) {
                    collect(shape, texts, hasImage);
                }
                String textFull = String.join("\n", texts);
                String title = slide.getTitle();
                if (title == null || title.trim().isEmpty()) {
                    title = firstLine(textFull);
                }
                result.add(new SlideContent(index++, clean(title), textFull, hasImage[0]));
            }
            return result;
        }
    }

    private void collect(Shape<?, ?> shape, List<String> texts, boolean[] hasImage) {
        if (shape instanceof PictureShape) {
            hasImage[0] = true;
        } else if (shape instanceof GroupShape) {
            for (Shape<?, ?> child : (GroupShape<?, ?>) shape) {
                collect(child, texts, hasImage);
            }
        } else if (shape instanceof TableShape) {
            TableShape<?, ?> table = (TableShape<?, ?>) shape;
            for (int r = 0; r < table.getNumberOfRows(); r++) {
                List<String> cells = new ArrayList<>();
                for (int c = 0; c < table.getNumberOfColumns(); c++) {
                    TableCell<?, ?> cell = table.getCell(r, c);
                    if (cell != null && cell.getText() != null) {
                        String t = clean(cell.getText());
                        if (!t.isEmpty()) cells.add(t);
                    }
                }
                if (!cells.isEmpty()) texts.add(String.join(" | ", cells));
            }
        } else if (shape instanceof TextShape) {
            String t = ((TextShape<?, ?>) shape).getText();
            if (t != null) {
                t = t.replace('\u000B', '\n').replace("\r", "").trim();
                if (!t.isEmpty()) texts.add(t);
            }
        }
    }

    private static String firstLine(String text) {
        for (String line : text.split("\n")) {
            if (!line.trim().isEmpty()) return line.trim();
        }
        return "";
    }

    private static String clean(String s) {
        if (s == null) return "";
        return s.replace('\u000B', ' ').replaceAll("\\s+", " ").trim();
    }
}
