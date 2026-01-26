/**
 * Microsoft Graph Calendar Query Client (via n8n Webhook)
 * ========================================================
 *
 * This module provides a GraphCalendarQueryClient for reading calendar data
 * through an n8n webhook that proxies requests to Microsoft Graph API.
 *
 * ## Configuration
 *
 * The webhook URL must be provided via the `CALENDAR_QUERY_WEBHOOK_URL` environment variable.
 * Use `getCalendarQuerySecrets()` from `secrets.ts` to read it.
 *
 * ## How It Works
 *
 * Instead of authenticating directly with Microsoft Graph, this client sends
 * requests to an n8n webhook which handles the authentication and forwards
 * the request to Microsoft Graph.
 *
 * Request format:
 * ```
 * POST <CALENDAR_QUERY_WEBHOOK_URL>
 * Content-Type: application/json
 *
 * {
 *   "url": "https://graph.microsoft.com/v1.0/me/events?$filter=..."
 * }
 * ```
 *
 * The webhook returns the exact response from Microsoft Graph.
 *
 * ## Usage Example
 *
 * ```typescript
 * import { GraphCalendarQueryClient } from "./calendar";
 * import { getCalendarQuerySecrets } from "./secrets";
 *
 * const secrets = getCalendarQuerySecrets();
 * const client = new GraphCalendarQueryClient({ webhookUrl: secrets.webhookUrl });
 *
 * // Get events for today
 * const todayEvents = await client.getEventsToday();
 *
 * // Search events by subject
 * const meetings = await client.getEventsBySubject("Team Sync");
 *
 * // Get a specific event by ID
 * const event = await client.getEventById("AAMkAGI2...");
 *
 * // List all calendars
 * const calendars = await client.listCalendars();
 * ```
 */

// ============================================================================
// Microsoft Graph Types
// ============================================================================

/**
 * Date/time with timezone information from Microsoft Graph.
 */
export type GraphDateTimeTimeZone = {
  /** Date and time in ISO 8601 format (e.g., "2024-01-15T10:00:00.0000000") */
  dateTime: string;
  /** IANA timezone name (e.g., "UTC", "America/New_York", "Pacific Standard Time") */
  timeZone: string;
};

/**
 * Email address information.
 */
export type GraphEmailAddress = {
  /** Display name of the person */
  name?: string;
  /** Email address */
  address: string;
};

/**
 * An attendee of a calendar event.
 */
export type GraphAttendee = {
  /** Email address of the attendee */
  emailAddress: GraphEmailAddress;
  /** Type of attendee */
  type?: "required" | "optional" | "resource";
  /** Response status of the attendee */
  status?: {
    response?: "none" | "organizer" | "tentativelyAccepted" | "accepted" | "declined" | "notResponded";
    time?: string;
  };
};

/**
 * Location information for an event.
 */
export type GraphLocation = {
  /** Display name of the location */
  displayName?: string;
  /** Location type */
  locationType?: "default" | "conferenceRoom" | "homeAddress" | "businessAddress" | "geoCoordinates" | "streetAddress" | "hotel" | "restaurant" | "localBusiness" | "postalAddress";
  /** Unique identifier for the location */
  uniqueId?: string;
  /** Type of unique identifier */
  uniqueIdType?: "unknown" | "locationStore" | "directory" | "private" | "bing";
  /** Physical address */
  address?: {
    street?: string;
    city?: string;
    state?: string;
    countryOrRegion?: string;
    postalCode?: string;
  };
  /** Geographic coordinates */
  coordinates?: {
    latitude?: number;
    longitude?: number;
  };
};

/**
 * Body content of an event (description).
 */
export type GraphItemBody = {
  /** Content type: text or HTML */
  contentType: "text" | "html";
  /** The actual content */
  content: string;
};

/**
 * Response status for a meeting.
 */
export type GraphResponseStatus = {
  /** The response type */
  response?: "none" | "organizer" | "tentativelyAccepted" | "accepted" | "declined" | "notResponded";
  /** Time of the response */
  time?: string;
};

/**
 * Online meeting information.
 */
export type GraphOnlineMeetingInfo = {
  /** Join URL for the online meeting */
  joinUrl?: string;
  /** Conference ID */
  conferenceId?: string;
  /** Toll number for dial-in */
  tollNumber?: string;
  /** Toll-free number for dial-in */
  tollFreeNumber?: string;
  /** Quick dial info */
  quickDial?: string;
  /** Phones for the meeting */
  phones?: Array<{
    number?: string;
    type?: "home" | "business" | "mobile" | "other" | "assistant" | "homeFax" | "businessFax" | "otherFax" | "pager" | "radio";
  }>;
};

/**
 * Recurrence pattern for recurring events.
 */
export type GraphRecurrencePattern = {
  /** Type of recurrence */
  type: "daily" | "weekly" | "absoluteMonthly" | "relativeMonthly" | "absoluteYearly" | "relativeYearly";
  /** Interval between occurrences */
  interval: number;
  /** Days of the week (for weekly recurrence) */
  daysOfWeek?: Array<"sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday">;
  /** Day of month (for monthly/yearly recurrence) */
  dayOfMonth?: number;
  /** Month (for yearly recurrence) */
  month?: number;
  /** First day of week */
  firstDayOfWeek?: "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday";
  /** Index of the week in the month */
  index?: "first" | "second" | "third" | "fourth" | "last";
};

/**
 * Recurrence range for recurring events.
 */
export type GraphRecurrenceRange = {
  /** Type of range */
  type: "endDate" | "noEnd" | "numbered";
  /** Start date of recurrence */
  startDate: string;
  /** End date (for endDate type) */
  endDate?: string;
  /** Number of occurrences (for numbered type) */
  numberOfOccurrences?: number;
  /** Recurrence timezone */
  recurrenceTimeZone?: string;
};

/**
 * Pattern recurrence combining pattern and range.
 */
export type GraphPatternedRecurrence = {
  pattern: GraphRecurrencePattern;
  range: GraphRecurrenceRange;
};

/**
 * A calendar event from Microsoft Graph.
 */
export type GraphEvent = {
  /** Unique identifier for the event */
  id?: string;
  /** Subject/title of the event */
  subject?: string;
  /** Body/description of the event */
  body?: GraphItemBody;
  /** Body preview (plain text snippet) */
  bodyPreview?: string;
  /** Start date/time */
  start?: GraphDateTimeTimeZone;
  /** End date/time */
  end?: GraphDateTimeTimeZone;
  /** Whether this is an all-day event */
  isAllDay?: boolean;
  /** Whether this event has been cancelled */
  isCancelled?: boolean;
  /** Whether this is a draft */
  isDraft?: boolean;
  /** Whether this is an online meeting */
  isOnlineMeeting?: boolean;
  /** Whether organizer is the current user */
  isOrganizer?: boolean;
  /** Whether reminder is on */
  isReminderOn?: boolean;
  /** Location of the event */
  location?: GraphLocation;
  /** Additional locations */
  locations?: GraphLocation[];
  /** Attendees of the event */
  attendees?: GraphAttendee[];
  /** Organizer of the event */
  organizer?: {
    emailAddress?: GraphEmailAddress;
  };
  /** Online meeting provider */
  onlineMeetingProvider?: "unknown" | "teamsForBusiness" | "skypeForBusiness" | "skypeForConsumer";
  /** Online meeting URL */
  onlineMeetingUrl?: string;
  /** Detailed online meeting info */
  onlineMeeting?: GraphOnlineMeetingInfo;
  /** Recurrence pattern */
  recurrence?: GraphPatternedRecurrence;
  /** Minutes before event to show reminder */
  reminderMinutesBeforeStart?: number;
  /** Response status (for meeting invites) */
  responseStatus?: GraphResponseStatus;
  /** Required response from attendees */
  responseRequested?: boolean;
  /** Series master ID (for recurring events) */
  seriesMasterId?: string;
  /** Show as status */
  showAs?: "free" | "tentative" | "busy" | "oof" | "workingElsewhere" | "unknown";
  /** Event type */
  type?: "singleInstance" | "occurrence" | "exception" | "seriesMaster";
  /** Web link to open in Outlook */
  webLink?: string;
  /** Importance */
  importance?: "low" | "normal" | "high";
  /** Sensitivity */
  sensitivity?: "normal" | "personal" | "private" | "confidential";
  /** Categories */
  categories?: string[];
  /** When the event was created */
  createdDateTime?: string;
  /** When the event was last modified */
  lastModifiedDateTime?: string;
  /** Original start timezone */
  originalStartTimeZone?: string;
  /** Original end timezone */
  originalEndTimeZone?: string;
  /** ICalendar UID */
  iCalUId?: string;
  /** Change key for concurrency */
  changeKey?: string;
};

/**
 * A calendar from Microsoft Graph.
 */
export type GraphCalendar = {
  /** Unique identifier for the calendar */
  id?: string;
  /** Name of the calendar */
  name?: string;
  /** Color of the calendar */
  color?: "auto" | "lightBlue" | "lightGreen" | "lightOrange" | "lightGray" | "lightYellow" | "lightTeal" | "lightPink" | "lightBrown" | "lightRed" | "maxColor";
  /** Hex color code */
  hexColor?: string;
  /** Whether this is the default calendar */
  isDefaultCalendar?: boolean;
  /** Whether the calendar can be edited */
  canEdit?: boolean;
  /** Whether the calendar can share */
  canShare?: boolean;
  /** Whether the calendar can view private items */
  canViewPrivateItems?: boolean;
  /** Whether this is a removable calendar */
  isRemovable?: boolean;
  /** Whether this is a tallying responses calendar */
  isTallyingResponses?: boolean;
  /** Owner of the calendar */
  owner?: GraphEmailAddress;
  /** Change key for concurrency */
  changeKey?: string;
  /** Allowed online meeting providers */
  allowedOnlineMeetingProviders?: string[];
  /** Default online meeting provider */
  defaultOnlineMeetingProvider?: string;
};

/**
 * Response wrapper for collections from Microsoft Graph.
 */
export type GraphCollectionResponse<T> = {
  /** The collection of items */
  value: T[];
  /** Link to next page of results (if paginated) */
  "@odata.nextLink"?: string;
  /** Total count (if $count=true) */
  "@odata.count"?: number;
  /** Context URL */
  "@odata.context"?: string;
};

// ============================================================================
// Client Configuration
// ============================================================================

export type GraphCalendarQueryClientConfig = {
  /**
   * URL for the n8n webhook that proxies requests to Microsoft Graph.
   * Required. Set via CALENDAR_QUERY_WEBHOOK_URL environment variable.
   */
  webhookUrl: string;
  /**
   * Base URL for Microsoft Graph API (used to construct query URLs).
   * Defaults to "https://graph.microsoft.com/v1.0"
   */
  graphBaseUrl?: string;
  /**
   * Custom fetch implementation (for testing).
   */
  fetchImpl?: typeof fetch;
};

// ============================================================================
// Query Options
// ============================================================================

export type EventQueryOptions = {
  /** Maximum number of events to return */
  top?: number;
  /** Number of events to skip (for pagination) */
  skip?: number;
  /** Order by clause (e.g., "start/dateTime asc") */
  orderBy?: string;
  /** Select specific fields (comma-separated or array) */
  select?: string | string[];
  /** Expand related entities */
  expand?: string;
  /** Custom filter (OData filter expression) */
  filter?: string;
};

export type CalendarViewOptions = {
  /** Start of the time range (ISO 8601 date/time) */
  startDateTime: string;
  /** End of the time range (ISO 8601 date/time) */
  endDateTime: string;
  /** Maximum number of events to return */
  top?: number;
  /** Number of events to skip (for pagination) */
  skip?: number;
  /** Order by clause */
  orderBy?: string;
  /** Select specific fields */
  select?: string | string[];
};

// ============================================================================
// Client Implementation
// ============================================================================

const DEFAULT_GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

/**
 * Builds OData query string from options.
 */
const buildODataQuery = (options?: EventQueryOptions): string => {
  if (!options) return "";
  
  const params = new URLSearchParams();
  
  if (options.top !== undefined) params.set("$top", String(options.top));
  if (options.skip !== undefined) params.set("$skip", String(options.skip));
  if (options.orderBy) params.set("$orderby", options.orderBy);
  if (options.filter) params.set("$filter", options.filter);
  if (options.expand) params.set("$expand", options.expand);
  
  if (options.select) {
    const selectStr = Array.isArray(options.select) ? options.select.join(",") : options.select;
    params.set("$select", selectStr);
  }
  
  const qs = params.toString();
  return qs ? `?${qs}` : "";
};

/**
 * Builds calendar view query string.
 */
const buildCalendarViewQuery = (options: CalendarViewOptions): string => {
  const params = new URLSearchParams();
  
  params.set("startDateTime", options.startDateTime);
  params.set("endDateTime", options.endDateTime);
  
  if (options.top !== undefined) params.set("$top", String(options.top));
  if (options.skip !== undefined) params.set("$skip", String(options.skip));
  if (options.orderBy) params.set("$orderby", options.orderBy);
  
  if (options.select) {
    const selectStr = Array.isArray(options.select) ? options.select.join(",") : options.select;
    params.set("$select", selectStr);
  }
  
  return `?${params.toString()}`;
};

/**
 * Escapes a string for use in OData filter expressions.
 */
const escapeODataString = (value: string): string => {
  return value.replace(/'/g, "''");
};

/**
 * Formats a date for OData filter (ISO 8601 format).
 */
const formatDateForOData = (date: Date | string): string => {
  if (typeof date === "string") return date;
  return date.toISOString();
};

/**
 * Client for querying Microsoft Graph Calendar data through n8n webhook.
 *
 * This client sends requests to an n8n webhook which handles authentication
 * and proxies the request to Microsoft Graph API.
 *
 * @example
 * ```typescript
 * import { GraphCalendarQueryClient } from "./calendar";
 * import { getCalendarQuerySecrets } from "./secrets";
 *
 * const secrets = getCalendarQuerySecrets();
 * const client = new GraphCalendarQueryClient({ webhookUrl: secrets.webhookUrl });
 * ```
 */
export class GraphCalendarQueryClient {
  private webhookUrl: string;
  private graphBaseUrl: string;
  private fetchImpl: typeof fetch;

  constructor(config: GraphCalendarQueryClientConfig) {
    this.webhookUrl = config.webhookUrl;
    this.graphBaseUrl = config.graphBaseUrl ?? DEFAULT_GRAPH_BASE_URL;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  /**
   * Sends a query to the n8n webhook.
   * @param graphUrl - Full Microsoft Graph URL to query
   * @returns The response from Microsoft Graph
   */
  private async query<T>(graphUrl: string): Promise<T> {
    const response = await this.fetchImpl(this.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: graphUrl }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Calendar query failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return (await response.json()) as T;
  }

  // ==========================================================================
  // Calendar Methods
  // ==========================================================================

  /**
   * Lists all calendars for the current user.
   *
   * @example
   * ```typescript
   * const calendars = await client.listCalendars();
   * calendars.value.forEach(cal => console.log(cal.name));
   * ```
   */
  async listCalendars(): Promise<GraphCollectionResponse<GraphCalendar>> {
    const url = `${this.graphBaseUrl}/me/calendars`;
    return this.query(url);
  }

  /**
   * Gets a specific calendar by ID.
   *
   * @param calendarId - The calendar ID
   *
   * @example
   * ```typescript
   * const calendar = await client.getCalendar("AAMkAGI2...");
   * console.log(calendar.name);
   * ```
   */
  async getCalendar(calendarId: string): Promise<GraphCalendar> {
    const url = `${this.graphBaseUrl}/me/calendars/${calendarId}`;
    return this.query(url);
  }

  // ==========================================================================
  // Event Query Methods
  // ==========================================================================

  /**
   * Lists events with optional filtering and pagination.
   *
   * @param calendarId - Optional calendar ID (defaults to primary calendar)
   * @param options - Query options (top, skip, filter, orderBy, select)
   *
   * @example
   * ```typescript
   * // Get first 10 events ordered by start time
   * const events = await client.listEvents(undefined, {
   *   top: 10,
   *   orderBy: "start/dateTime asc"
   * });
   * ```
   */
  async listEvents(
    calendarId?: string,
    options?: EventQueryOptions
  ): Promise<GraphCollectionResponse<GraphEvent>> {
    const path = calendarId
      ? `/me/calendars/${calendarId}/events`
      : "/me/events";
    const url = `${this.graphBaseUrl}${path}${buildODataQuery(options)}`;
    return this.query(url);
  }

  /**
   * Gets a calendar view (expanded recurring events) for a date range.
   * This is the recommended way to get events for a specific time period.
   *
   * @param options - Must include startDateTime and endDateTime
   * @param calendarId - Optional calendar ID (defaults to primary calendar)
   *
   * @example
   * ```typescript
   * // Get all events for this week
   * const events = await client.getCalendarView({
   *   startDateTime: "2024-01-15T00:00:00Z",
   *   endDateTime: "2024-01-21T23:59:59Z",
   *   top: 50,
   *   orderBy: "start/dateTime asc"
   * });
   * ```
   */
  async getCalendarView(
    options: CalendarViewOptions,
    calendarId?: string
  ): Promise<GraphCollectionResponse<GraphEvent>> {
    const path = calendarId
      ? `/me/calendars/${calendarId}/calendarView`
      : "/me/calendarView";
    const url = `${this.graphBaseUrl}${path}${buildCalendarViewQuery(options)}`;
    return this.query(url);
  }

  /**
   * Gets a specific event by ID.
   *
   * @param eventId - The event ID
   * @param calendarId - Optional calendar ID
   *
   * @example
   * ```typescript
   * const event = await client.getEventById("AAMkAGI2...");
   * console.log(event.subject, event.start?.dateTime);
   * ```
   */
  async getEventById(eventId: string, calendarId?: string): Promise<GraphEvent> {
    const path = calendarId
      ? `/me/calendars/${calendarId}/events/${eventId}`
      : `/me/events/${eventId}`;
    const url = `${this.graphBaseUrl}${path}`;
    return this.query(url);
  }

  /**
   * Gets events within a date range using calendarView.
   * This properly expands recurring events.
   *
   * @param startDate - Start date (ISO string or Date object)
   * @param endDate - End date (ISO string or Date object)
   * @param options - Additional query options
   * @param calendarId - Optional calendar ID
   *
   * @example
   * ```typescript
   * // Get events for today
   * const today = new Date();
   * const tomorrow = new Date(today);
   * tomorrow.setDate(tomorrow.getDate() + 1);
   *
   * const events = await client.getEventsByDateRange(
   *   today.toISOString(),
   *   tomorrow.toISOString()
   * );
   * ```
   */
  async getEventsByDateRange(
    startDate: string | Date,
    endDate: string | Date,
    options?: Omit<CalendarViewOptions, "startDateTime" | "endDateTime">,
    calendarId?: string
  ): Promise<GraphCollectionResponse<GraphEvent>> {
    return this.getCalendarView(
      {
        startDateTime: formatDateForOData(startDate),
        endDateTime: formatDateForOData(endDate),
        ...options,
      },
      calendarId
    );
  }

  /**
   * Gets events for today.
   *
   * @param options - Additional query options
   * @param calendarId - Optional calendar ID
   *
   * @example
   * ```typescript
   * const todayEvents = await client.getEventsToday();
   * console.log(`You have ${todayEvents.value.length} events today`);
   * ```
   */
  async getEventsToday(
    options?: Omit<CalendarViewOptions, "startDateTime" | "endDateTime">,
    calendarId?: string
  ): Promise<GraphCollectionResponse<GraphEvent>> {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

    return this.getEventsByDateRange(startOfDay, endOfDay, options, calendarId);
  }

  /**
   * Gets events for this week (Monday to Sunday).
   *
   * @param options - Additional query options
   * @param calendarId - Optional calendar ID
   *
   * @example
   * ```typescript
   * const weekEvents = await client.getEventsThisWeek({ orderBy: "start/dateTime asc" });
   * ```
   */
  async getEventsThisWeek(
    options?: Omit<CalendarViewOptions, "startDateTime" | "endDateTime">,
    calendarId?: string
  ): Promise<GraphCollectionResponse<GraphEvent>> {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return this.getEventsByDateRange(monday, sunday, options, calendarId);
  }

  /**
   * Gets events for the next N days.
   *
   * @param days - Number of days to look ahead
   * @param options - Additional query options
   * @param calendarId - Optional calendar ID
   *
   * @example
   * ```typescript
   * // Get events for the next 7 days
   * const upcomingEvents = await client.getEventsNextDays(7);
   * ```
   */
  async getEventsNextDays(
    days: number,
    options?: Omit<CalendarViewOptions, "startDateTime" | "endDateTime">,
    calendarId?: string
  ): Promise<GraphCollectionResponse<GraphEvent>> {
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + days);
    end.setHours(23, 59, 59, 999);

    return this.getEventsByDateRange(start, end, options, calendarId);
  }

  /**
   * Searches events by subject (title) containing the search term.
   *
   * @param searchTerm - Text to search for in event subjects
   * @param options - Additional query options
   * @param calendarId - Optional calendar ID
   *
   * @example
   * ```typescript
   * // Find all events with "sync" in the title
   * const syncMeetings = await client.getEventsBySubject("sync");
   * ```
   */
  async getEventsBySubject(
    searchTerm: string,
    options?: Omit<EventQueryOptions, "filter">,
    calendarId?: string
  ): Promise<GraphCollectionResponse<GraphEvent>> {
    const filter = `contains(subject, '${escapeODataString(searchTerm)}')`;
    return this.listEvents(calendarId, { ...options, filter });
  }

  /**
   * Gets events organized by a specific person (by email).
   *
   * @param organizerEmail - Email address of the organizer
   * @param options - Additional query options
   * @param calendarId - Optional calendar ID
   *
   * @example
   * ```typescript
   * // Find events organized by your manager
   * const managerMeetings = await client.getEventsByOrganizer("manager@company.com");
   * ```
   */
  async getEventsByOrganizer(
    organizerEmail: string,
    options?: Omit<EventQueryOptions, "filter">,
    calendarId?: string
  ): Promise<GraphCollectionResponse<GraphEvent>> {
    const filter = `organizer/emailAddress/address eq '${escapeODataString(organizerEmail)}'`;
    return this.listEvents(calendarId, { ...options, filter });
  }

  /**
   * Gets events with a specific attendee (by email).
   *
   * @param attendeeEmail - Email address of the attendee
   * @param options - Additional query options
   * @param calendarId - Optional calendar ID
   *
   * @example
   * ```typescript
   * // Find meetings where a colleague is attending
   * const sharedMeetings = await client.getEventsByAttendee("colleague@company.com");
   * ```
   */
  async getEventsByAttendee(
    attendeeEmail: string,
    options?: Omit<EventQueryOptions, "filter">,
    calendarId?: string
  ): Promise<GraphCollectionResponse<GraphEvent>> {
    const filter = `attendees/any(a:a/emailAddress/address eq '${escapeODataString(attendeeEmail)}')`;
    return this.listEvents(calendarId, { ...options, filter });
  }

  /**
   * Gets events in a specific category.
   *
   * @param category - Category name
   * @param options - Additional query options
   * @param calendarId - Optional calendar ID
   *
   * @example
   * ```typescript
   * // Find all events in the "Work" category
   * const workEvents = await client.getEventsByCategory("Work");
   * ```
   */
  async getEventsByCategory(
    category: string,
    options?: Omit<EventQueryOptions, "filter">,
    calendarId?: string
  ): Promise<GraphCollectionResponse<GraphEvent>> {
    const filter = `categories/any(c:c eq '${escapeODataString(category)}')`;
    return this.listEvents(calendarId, { ...options, filter });
  }

  /**
   * Gets online meetings only (Teams, Skype, etc.).
   *
   * @param options - Additional query options
   * @param calendarId - Optional calendar ID
   *
   * @example
   * ```typescript
   * // Find all online meetings
   * const onlineMeetings = await client.getOnlineMeetings();
   * ```
   */
  async getOnlineMeetings(
    options?: Omit<EventQueryOptions, "filter">,
    calendarId?: string
  ): Promise<GraphCollectionResponse<GraphEvent>> {
    const filter = "isOnlineMeeting eq true";
    return this.listEvents(calendarId, { ...options, filter });
  }

  /**
   * Gets all-day events only.
   *
   * @param options - Additional query options
   * @param calendarId - Optional calendar ID
   *
   * @example
   * ```typescript
   * // Find all-day events (holidays, PTO, etc.)
   * const allDayEvents = await client.getAllDayEvents();
   * ```
   */
  async getAllDayEvents(
    options?: Omit<EventQueryOptions, "filter">,
    calendarId?: string
  ): Promise<GraphCollectionResponse<GraphEvent>> {
    const filter = "isAllDay eq true";
    return this.listEvents(calendarId, { ...options, filter });
  }

  /**
   * Gets recurring event series (master events only).
   *
   * @param options - Additional query options
   * @param calendarId - Optional calendar ID
   *
   * @example
   * ```typescript
   * // Find all recurring meeting series
   * const recurringMeetings = await client.getRecurringSeries();
   * ```
   */
  async getRecurringSeries(
    options?: Omit<EventQueryOptions, "filter">,
    calendarId?: string
  ): Promise<GraphCollectionResponse<GraphEvent>> {
    const filter = "type eq 'seriesMaster'";
    return this.listEvents(calendarId, { ...options, filter });
  }

  /**
   * Gets cancelled events.
   *
   * @param options - Additional query options
   * @param calendarId - Optional calendar ID
   *
   * @example
   * ```typescript
   * // Find cancelled events
   * const cancelledEvents = await client.getCancelledEvents();
   * ```
   */
  async getCancelledEvents(
    options?: Omit<EventQueryOptions, "filter">,
    calendarId?: string
  ): Promise<GraphCollectionResponse<GraphEvent>> {
    const filter = "isCancelled eq true";
    return this.listEvents(calendarId, { ...options, filter });
  }

  /**
   * Gets events with a specific importance level.
   *
   * @param importance - Importance level: "low", "normal", or "high"
   * @param options - Additional query options
   * @param calendarId - Optional calendar ID
   *
   * @example
   * ```typescript
   * // Find high-importance events
   * const importantEvents = await client.getEventsByImportance("high");
   * ```
   */
  async getEventsByImportance(
    importance: "low" | "normal" | "high",
    options?: Omit<EventQueryOptions, "filter">,
    calendarId?: string
  ): Promise<GraphCollectionResponse<GraphEvent>> {
    const filter = `importance eq '${importance}'`;
    return this.listEvents(calendarId, { ...options, filter });
  }

  /**
   * Executes a raw Graph URL query through the webhook.
   * Use this for custom queries not covered by other methods.
   *
   * @param graphUrl - Full Microsoft Graph URL
   *
   * @example
   * ```typescript
   * // Custom query with complex filter
   * const result = await client.rawQuery<GraphCollectionResponse<GraphEvent>>(
   *   "https://graph.microsoft.com/v1.0/me/events?$filter=start/dateTime ge '2024-01-01'&$top=5"
   * );
   * ```
   */
  async rawQuery<T>(graphUrl: string): Promise<T> {
    return this.query<T>(graphUrl);
  }
}
