use std::sync::LazyLock;

use regex::Regex;
use serde::{Deserialize, Serialize};

static RE_POINT: LazyLock<Option<Regex>> = LazyLock::new(|| Regex::new(r"\[POINT:(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)(?::(.+?))?\]").ok());
static RE_RECT: LazyLock<Option<Regex>> = LazyLock::new(|| Regex::new(r"\[RECT:(\d+(?:\.\d+)?),(\d+(?:\.\d+)?),(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)(?::(.+?))?\]").ok());
static RE_SCRIBBLE: LazyLock<Option<Regex>> = LazyLock::new(|| Regex::new(r"\[SCRIBBLE:((?:\d+(?:\.\d+)?,\d+(?:\.\d+)?;?)+)(?::(.+?))?\]").ok());
static RE_OFFER: LazyLock<Option<Regex>> = LazyLock::new(|| Regex::new(r"\[OFFER:(.+?)\]").ok());
static RE_HIGHLIGHT: LazyLock<Option<Regex>> = LazyLock::new(||
    Regex::new(r"\[HIGHLIGHT:(\d+(?:\.\d+)?),(\d+(?:\.\d+)?),(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)(?::(.+?))?\]").ok()
);
static RE_SHAPE: LazyLock<Option<Regex>> = LazyLock::new(||
    Regex::new(r"\[SHAPE:(arrow|curve):(\d+(?:\.\d+)?),(\d+(?:\.\d+)?):(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)(?::(.+?))?\]").ok()
);
static RE_STRIP: LazyLock<Option<Regex>> = LazyLock::new(||
    Regex::new(r"\[(?:POINT|RECT|SCRIBBLE|OFFER|HIGHLIGHT|SHAPE)[^\]]*\]").ok()
);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GuidanceTag {
    Point {
        x: f64,
        y: f64,
        label: Option<String>,
    },
    Rect {
        x: f64,
        y: f64,
        w: f64,
        h: f64,
        label: Option<String>,
    },
    Scribble {
        points: Vec<(f64, f64)>,
        label: Option<String>,
    },
    Offer {
        agent_slug: String,
    },
    Highlight {
        x: f64,
        y: f64,
        w: f64,
        h: f64,
        label: Option<String>,
    },
    Shape {
        shape_type: String,
        x1: f64,
        y1: f64,
        x2: f64,
        y2: f64,
        label: Option<String>,
    },
}

pub fn parse_guidance_tags(text: &str) -> Vec<GuidanceTag> {
    let mut tags = Vec::new();

    if let Some(ref re) = *RE_POINT {
        for cap in re.captures_iter(text) {
            let x: f64 = cap[1].parse().unwrap_or(0.0);
            let y: f64 = cap[2].parse().unwrap_or(0.0);
            let label = cap.get(3).map(|m| m.as_str().to_string());
            tags.push(GuidanceTag::Point { x, y, label });
        }
    }

    if let Some(ref re) = *RE_RECT {
        for cap in re.captures_iter(text) {
            let x: f64 = cap[1].parse().unwrap_or(0.0);
            let y: f64 = cap[2].parse().unwrap_or(0.0);
            let w: f64 = cap[3].parse().unwrap_or(0.0);
            let h: f64 = cap[4].parse().unwrap_or(0.0);
            let label = cap.get(5).map(|m| m.as_str().to_string());
            tags.push(GuidanceTag::Rect { x, y, w, h, label });
        }
    }

    if let Some(ref re) = *RE_SCRIBBLE {
        for cap in re.captures_iter(text) {
            let points_str = cap[1].to_string();
            let label = cap.get(2).map(|m| m.as_str().to_string());
            let points: Vec<(f64, f64)> = points_str
                .split(';')
                .filter_map(|pair| {
                    let mut parts = pair.splitn(2, ',');
                    let x = parts.next()?.parse().ok()?;
                    let y = parts.next()?.parse().ok()?;
                    Some((x, y))
                })
                .collect();
            if !points.is_empty() {
                tags.push(GuidanceTag::Scribble { points, label });
            }
        }
    }

    if let Some(ref re) = *RE_OFFER {
        for cap in re.captures_iter(text) {
            let slug = cap[1].to_string();
            tags.push(GuidanceTag::Offer { agent_slug: slug });
        }
    }

    if let Some(ref re) = *RE_HIGHLIGHT {
        for cap in re.captures_iter(text) {
            let x: f64 = cap[1].parse().unwrap_or(0.0);
            let y: f64 = cap[2].parse().unwrap_or(0.0);
            let w: f64 = cap[3].parse().unwrap_or(0.0);
            let h: f64 = cap[4].parse().unwrap_or(0.0);
            let label = cap.get(5).map(|m| m.as_str().to_string());
            tags.push(GuidanceTag::Highlight { x, y, w, h, label });
        }
    }

    if let Some(ref re) = *RE_SHAPE {
        for cap in re.captures_iter(text) {
            let shape_type = cap[1].to_string();
            let x1: f64 = cap[2].parse().unwrap_or(0.0);
            let y1: f64 = cap[3].parse().unwrap_or(0.0);
            let x2: f64 = cap[4].parse().unwrap_or(0.0);
            let y2: f64 = cap[5].parse().unwrap_or(0.0);
            let label = cap.get(6).map(|m| m.as_str().to_string());
            tags.push(GuidanceTag::Shape { shape_type, x1, y1, x2, y2, label });
        }
    }

    tags
}

pub fn strip_guidance_tags(text: &str) -> String {
    match &*RE_STRIP {
        Some(re) => re.replace_all(text, "").to_string(),
        None => text.to_string(),
    }
}

pub fn strip_trailing_guidance_tags(text: &str) -> String {
    let stripped = strip_guidance_tags(text);
    let trimmed = stripped.trim();
    if let Some(separator) = trimmed.rfind("---") {
        let before = &trimmed[..separator].trim();
        let after = &trimmed[separator + 3..].trim();
        if after.is_empty() || after.chars().all(|c| c == '-' || c == ' ' || c == '\n') {
            return before.to_string();
        }
    }
    trimmed.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_point_tag() {
        let tags = parse_guidance_tags("[POINT:100,200:click here]");
        assert_eq!(tags.len(), 1);
        match &tags[0] {
            GuidanceTag::Point { x, y, label } => {
                assert_eq!(*x, 100.0);
                assert_eq!(*y, 200.0);
                assert_eq!(label.as_deref(), Some("click here"));
            }
            _ => panic!("expected Point tag"),
        }
    }

    #[test]
    fn test_parse_highlight_tag() {
        let tags = parse_guidance_tags("[HIGHLIGHT:10,20,300,150:important area]");
        assert_eq!(tags.len(), 1);
        match &tags[0] {
            GuidanceTag::Highlight { x, y, w, h, label } => {
                assert_eq!(*x, 10.0);
                assert_eq!(*y, 20.0);
                assert_eq!(*w, 300.0);
                assert_eq!(*h, 150.0);
                assert_eq!(label.as_deref(), Some("important area"));
            }
            _ => panic!("expected Highlight tag"),
        }
    }

    #[test]
    fn test_parse_highlight_tag_no_label() {
        let tags = parse_guidance_tags("[HIGHLIGHT:0,0,100,50]");
        assert_eq!(tags.len(), 1);
        match &tags[0] {
            GuidanceTag::Highlight { label, .. } => {
                assert!(label.is_none());
            }
            _ => panic!("expected Highlight tag"),
        }
    }

    #[test]
    fn test_parse_shape_arrow() {
        let tags = parse_guidance_tags("[SHAPE:arrow:100,200:400,500:look here]");
        assert_eq!(tags.len(), 1);
        match &tags[0] {
            GuidanceTag::Shape { shape_type, x1, y1, x2, y2, label } => {
                assert_eq!(shape_type, "arrow");
                assert_eq!(*x1, 100.0);
                assert_eq!(*y1, 200.0);
                assert_eq!(*x2, 400.0);
                assert_eq!(*y2, 500.0);
                assert_eq!(label.as_deref(), Some("look here"));
            }
            _ => panic!("expected Shape tag"),
        }
    }

    #[test]
    fn test_parse_shape_curve() {
        let tags = parse_guidance_tags("[SHAPE:curve:0,0:100,100]");
        assert_eq!(tags.len(), 1);
        match &tags[0] {
            GuidanceTag::Shape { shape_type, .. } => {
                assert_eq!(shape_type, "curve");
            }
            _ => panic!("expected Shape tag"),
        }
    }

    #[test]
    fn test_strip_highlight_tag() {
        let text = "Here is some content [HIGHLIGHT:10,10,50,50] and more text.";
        let stripped = strip_guidance_tags(text);
        assert!(!stripped.contains("[HIGHLIGHT"));
        assert!(stripped.contains("Here is some content"));
        assert!(stripped.contains("and more text."));
    }

    #[test]
    fn test_strip_shape_tag() {
        let text = "Follow this arrow [SHAPE:arrow:0,0:100,100:direction] to the target.";
        let stripped = strip_guidance_tags(text);
        assert!(!stripped.contains("[SHAPE"));
        assert!(stripped.contains("Follow this arrow"));
    }

    #[test]
    fn test_strip_mixed_tags() {
        let text = "[POINT:10,20] text [HIGHLIGHT:0,0,50,50:hi] more [SHAPE:arrow:0,0:10,10]";
        let stripped = strip_guidance_tags(text);
        assert!(!stripped.contains('['));
        assert!(stripped.contains("text"));
        assert!(stripped.contains("more"));
    }

    #[test]
    fn test_parse_multiple_tags_in_text() {
        let text = "Click [POINT:100,200] and see [HIGHLIGHT:50,50,200,100:region] then follow [SHAPE:arrow:50,150:200,150:path]";
        let tags = parse_guidance_tags(text);
        assert_eq!(tags.len(), 3);
    }
}
