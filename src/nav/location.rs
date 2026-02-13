#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Location {
    pub namespace: String,
    pub segments: Vec<RouteSegment>,
}

impl Location {
    pub fn new(namespace: String, segments: Vec<RouteSegment>) -> Self {
        Self {
            namespace,
            segments,
        }
    }

    pub fn leaf(&self) -> Option<&RouteSegment> {
        self.segments.last()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RouteSegment {
    Workflows(WorkflowsRoute),
    Schedules(SchedulesRoute),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorkflowsRoute {
    Collection {
        query: Option<String>,
    },
    Detail {
        workflow_id: String,
        run_id: Option<String>,
        tab: Option<String>,
    },
    Activities {
        workflow_id: String,
        activity_id: Option<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SchedulesRoute {
    Collection {
        query: Option<String>,
    },
    Detail {
        schedule_id: String,
    },
    Workflows {
        schedule_id: String,
        query: Option<String>,
    },
}
