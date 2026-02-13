use std::collections::HashMap;

use super::{Location, RouteSegment, SchedulesRoute, WorkflowsRoute};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum UriError {
    InvalidScheme,
    InvalidAuthority,
    MissingNamespace,
    InvalidPath,
    UnsupportedRoute,
}

pub fn parse_deep_link(input: &str) -> Result<Location, UriError> {
    let (scheme, rest) = input.split_once("://").ok_or(UriError::InvalidScheme)?;
    if scheme != "temporal" {
        return Err(UriError::InvalidScheme);
    }

    let (authority, path_and_query) = match rest.split_once('/') {
        Some((auth, remainder)) => (auth, format!("/{}", remainder)),
        None => (rest, String::from("/")),
    };

    if authority != "tui" {
        return Err(UriError::InvalidAuthority);
    }

    let (path, query) = match path_and_query.split_once('?') {
        Some((p, q)) => (p, Some(q)),
        None => (path_and_query.as_str(), None),
    };

    let segments: Vec<String> = path
        .split('/')
        .filter(|s| !s.is_empty())
        .map(percent_decode_path)
        .collect();

    if segments.len() < 2 || segments[0] != "namespaces" {
        return Err(UriError::MissingNamespace);
    }

    let namespace = segments[1].to_string();
    let route_segments = &segments[2..];
    let params = parse_query(query);

    let segments = parse_route(route_segments, &params)?;
    Ok(Location::new(namespace, segments))
}

pub fn format_deep_link(location: &Location) -> String {
    let mut path = String::from("/namespaces/");
    path.push_str(&percent_encode(&location.namespace));

    for segment in &location.segments {
        match segment {
            RouteSegment::Workflows(route) => format_workflows_route(&mut path, route),
            RouteSegment::Schedules(route) => format_schedules_route(&mut path, route),
        }
    }

    let query = build_query(location);
    if query.is_empty() {
        format!("temporal://tui{}", path)
    } else {
        format!("temporal://tui{}?{}", path, query)
    }
}

fn parse_route(
    segments: &[String],
    params: &HashMap<String, String>,
) -> Result<Vec<RouteSegment>, UriError> {
    if segments.is_empty() {
        return Err(UriError::InvalidPath);
    }

    match segments[0].as_str() {
        "workflows" => parse_workflows_route(&segments[1..], params),
        "schedules" => parse_schedules_route(&segments[1..], params),
        _ => Err(UriError::UnsupportedRoute),
    }
}

fn parse_workflows_route(
    segments: &[String],
    params: &HashMap<String, String>,
) -> Result<Vec<RouteSegment>, UriError> {
    if segments.is_empty() {
        return Ok(vec![RouteSegment::Workflows(WorkflowsRoute::Collection {
            query: params.get("q").cloned(),
        })]);
    }

    let workflow_id = segments[0].to_string();
    if segments.len() == 1 {
        return Ok(vec![RouteSegment::Workflows(WorkflowsRoute::Detail {
            workflow_id,
            run_id: params.get("run_id").cloned(),
            tab: params.get("tab").cloned(),
        })]);
    }

    if segments.len() >= 2 && segments[1] == "activities" {
        let activity_id = segments.get(2).cloned();
        return Ok(vec![RouteSegment::Workflows(WorkflowsRoute::Activities {
            workflow_id,
            activity_id,
        })]);
    }

    Err(UriError::UnsupportedRoute)
}

fn parse_schedules_route(
    segments: &[String],
    params: &HashMap<String, String>,
) -> Result<Vec<RouteSegment>, UriError> {
    if segments.is_empty() {
        return Ok(vec![RouteSegment::Schedules(SchedulesRoute::Collection {
            query: params.get("q").cloned(),
        })]);
    }

    let schedule_id = segments[0].to_string();
    if segments.len() == 1 {
        return Ok(vec![RouteSegment::Schedules(SchedulesRoute::Detail {
            schedule_id,
        })]);
    }

    if segments.len() == 2 && segments[1] == "workflows" {
        return Ok(vec![RouteSegment::Schedules(SchedulesRoute::Workflows {
            schedule_id,
            query: params.get("q").cloned(),
        })]);
    }

    Err(UriError::UnsupportedRoute)
}

fn format_workflows_route(path: &mut String, route: &WorkflowsRoute) {
    match route {
        WorkflowsRoute::Collection { .. } => {
            path.push_str("/workflows");
        }
        WorkflowsRoute::Detail { workflow_id, .. } => {
            path.push_str("/workflows/");
            path.push_str(&percent_encode(workflow_id));
        }
        WorkflowsRoute::Activities {
            workflow_id,
            activity_id,
        } => {
            path.push_str("/workflows/");
            path.push_str(&percent_encode(workflow_id));
            path.push_str("/activities");
            if let Some(id) = activity_id {
                path.push('/');
                path.push_str(&percent_encode(id));
            }
        }
    }
}

fn format_schedules_route(path: &mut String, route: &SchedulesRoute) {
    match route {
        SchedulesRoute::Collection { .. } => {
            path.push_str("/schedules");
        }
        SchedulesRoute::Detail { schedule_id } => {
            path.push_str("/schedules/");
            path.push_str(&percent_encode(schedule_id));
        }
        SchedulesRoute::Workflows { schedule_id, .. } => {
            path.push_str("/schedules/");
            path.push_str(&percent_encode(schedule_id));
            path.push_str("/workflows");
        }
    }
}

fn build_query(location: &Location) -> String {
    let mut params: Vec<(String, String)> = Vec::new();

    if let Some(segment) = location.leaf() {
        match segment {
            RouteSegment::Workflows(WorkflowsRoute::Collection { query }) => {
                if let Some(q) = query {
                    params.push((String::from("q"), q.clone()));
                }
            }
            RouteSegment::Workflows(WorkflowsRoute::Detail { run_id, tab, .. }) => {
                if let Some(run_id) = run_id {
                    params.push((String::from("run_id"), run_id.clone()));
                }
                if let Some(tab) = tab {
                    params.push((String::from("tab"), tab.clone()));
                }
            }
            RouteSegment::Schedules(SchedulesRoute::Collection { query }) => {
                if let Some(q) = query {
                    params.push((String::from("q"), q.clone()));
                }
            }
            RouteSegment::Schedules(SchedulesRoute::Workflows { query, .. }) => {
                if let Some(q) = query {
                    params.push((String::from("q"), q.clone()));
                }
            }
            _ => {}
        }
    }

    params
        .into_iter()
        .map(|(k, v)| format!("{}={}", percent_encode(&k), percent_encode(&v)))
        .collect::<Vec<_>>()
        .join("&")
}

fn parse_query(query: Option<&str>) -> HashMap<String, String> {
    let mut params = HashMap::new();
    let Some(query) = query else {
        return params;
    };

    for pair in query.split('&') {
        if pair.is_empty() {
            continue;
        }
        let (key, value) = match pair.split_once('=') {
            Some((k, v)) => (k, v),
            None => (pair, ""),
        };
        params.insert(percent_decode_query(key), percent_decode_query(value));
    }

    params
}

fn percent_encode(input: &str) -> String {
    let mut out = String::new();
    for b in input.as_bytes() {
        match *b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                out.push(*b as char)
            }
            _ => out.push_str(&format!("%{:02X}", b)),
        }
    }
    out
}

fn percent_decode_path(input: &str) -> String {
    percent_decode_inner(input, false)
}

fn percent_decode_query(input: &str) -> String {
    percent_decode_inner(input, true)
}

fn percent_decode_inner(input: &str, plus_as_space: bool) -> String {
    let mut out = String::new();
    let mut chars = input.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch == '%' {
            let hi = chars.next();
            let lo = chars.next();
            if let (Some(hi), Some(lo)) = (hi, lo) {
                if let (Some(hi), Some(lo)) = (hi.to_digit(16), lo.to_digit(16)) {
                    let byte = (hi << 4) + lo;
                    out.push(byte as u8 as char);
                    continue;
                }
            }
            out.push('%');
            if let Some(hi) = hi {
                out.push(hi);
            }
            if let Some(lo) = lo {
                out.push(lo);
            }
        } else if plus_as_space && ch == '+' {
            out.push(' ');
        } else {
            out.push(ch);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_workflows_collection_with_query() {
        let location = Location::new(
            "default".to_string(),
            vec![RouteSegment::Workflows(WorkflowsRoute::Collection {
                query: Some("ExecutionStatus = 'Running'".to_string()),
            })],
        );

        let uri = format_deep_link(&location);
        let parsed = parse_deep_link(&uri).expect("parse deep link");

        assert_eq!(parsed, location);
    }

    #[test]
    fn roundtrip_workflow_detail_with_run_id() {
        let location = Location::new(
            "prod".to_string(),
            vec![RouteSegment::Workflows(WorkflowsRoute::Detail {
                workflow_id: "order-123".to_string(),
                run_id: Some("run-abc".to_string()),
                tab: Some("history".to_string()),
            })],
        );

        let uri = format_deep_link(&location);
        let parsed = parse_deep_link(&uri).expect("parse deep link");

        assert_eq!(parsed, location);
    }

    #[test]
    fn roundtrip_schedule_workflows_query() {
        let location = Location::new(
            "default".to_string(),
            vec![RouteSegment::Schedules(SchedulesRoute::Workflows {
                schedule_id: "nightly-reconcile".to_string(),
                query: Some("ExecutionStatus = 'Failed'".to_string()),
            })],
        );

        let uri = format_deep_link(&location);
        let parsed = parse_deep_link(&uri).expect("parse deep link");

        assert_eq!(parsed, location);
    }
}
