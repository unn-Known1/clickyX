use serde::{Deserialize, Serialize};

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
}

pub fn parse_guidance_tags(text: &str) -> Vec<GuidanceTag> {
    let mut tags = Vec::new();
    let re_point = regex::Regex::new(r"\[POINT:(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)(?::(.+?))?\]").ok();
    let re_rect = regex::Regex::new(r"\[RECT:(\d+(?:\.\d+)?),(\d+(?:\.\d+)?),(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)(?::(.+?))?\]").ok();
    let re_scribble = regex::Regex::new(r"\[SCRIBBLE:((?:\d+(?:\.\d+)?,\d+(?:\.\d+)?;?)+)(?::(.+?))?\]").ok();
    let re_offer = regex::Regex::new(r"\[OFFER:(.+?)\]").ok();

    if let Some(ref re) = re_point {
        for cap in re.captures_iter(text) {
            let x: f64 = cap[1].parse().unwrap_or(0.0);
            let y: f64 = cap[2].parse().unwrap_or(0.0);
            let label = cap.get(3).map(|m| m.as_str().to_string());
            tags.push(GuidanceTag::Point { x, y, label });
        }
    }

    if let Some(ref re) = re_rect {
        for cap in re.captures_iter(text) {
            let x: f64 = cap[1].parse().unwrap_or(0.0);
            let y: f64 = cap[2].parse().unwrap_or(0.0);
            let w: f64 = cap[3].parse().unwrap_or(0.0);
            let h: f64 = cap[4].parse().unwrap_or(0.0);
            let label = cap.get(5).map(|m| m.as_str().to_string());
            tags.push(GuidanceTag::Rect { x, y, w, h, label });
        }
    }

    if let Some(ref re) = re_scribble {
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

    if let Some(ref re) = re_offer {
        for cap in re.captures_iter(text) {
            let slug = cap[1].to_string();
            tags.push(GuidanceTag::Offer { agent_slug: slug });
        }
    }

    tags
}

pub fn strip_guidance_tags(text: &str) -> String {
    let re = regex::Regex::new(r"\[(?:POINT|RECT|SCRIBBLE|OFFER)[^\]]*\]").ok();
    match re {
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
